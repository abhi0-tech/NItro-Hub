using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using NitroHub.Core.Control;
using NitroHub.Core.Engine;
using NitroHub.Core.Hardware;
using NitroHub.Core.Ipc;
using NitroHub.Core.Lighting;
using NitroHub.Core.Settings;

namespace NitroHub.Service;

/// <summary>
/// Loopback TCP JSON-lines bridge (127.0.0.1:47631) exposing HubEngine to the Nitro Hub Electron process.
/// Supports both request/response commands and push event subscriptions ("subscribe").
/// </summary>
internal sealed class TcpBridgeServer : IDisposable
{
    public const int Port = 47631;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HubEngine _engine;
    private readonly DebugLogBuffer _logs;
    private readonly ILogger<TcpBridgeServer> _log;
    private readonly ConcurrentDictionary<Guid, StreamWriter> _subscribers = new();
    private readonly string _authToken;

    private static readonly string TokenPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "NitroHub",
        "bridge.token");

    public TcpBridgeServer(HubEngine engine, DebugLogBuffer logs, ILogger<TcpBridgeServer> log)
    {
        _engine = engine;
        _logs = logs;
        _log = log;
        _authToken = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(TokenPath)!);
            File.WriteAllText(TokenPath, _authToken, Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Failed to persist bridge auth token");
        }
        _engine.TelemetryUpdated += OnTelemetryUpdated;
        _engine.NoticeRaised += OnNoticeRaised;
        _engine.Rebuilt += OnRebuilt;
        _engine.SettingsChanged += OnSettingsChanged;
        _logs.OnLog += OnDebugLog;
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var listener = new TcpListener(IPAddress.Loopback, Port);
        listener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        listener.Start();
        _log.LogInformation("TcpBridgeServer listening on 127.0.0.1:{Port}", Port);

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                TcpClient client;
                try
                {
                    client = await listener.AcceptTcpClientAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                _ = Task.Run(() => HandleClientAsync(client, cancellationToken), cancellationToken);
            }
        }
        finally
        {
            listener.Stop();
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        Guid? subscriberId = null;
        try
        {
            using (client)
            {
                using var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.UTF8, false, 4096, leaveOpen: true);
                using var writer = new StreamWriter(stream, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true };

                while (!cancellationToken.IsCancellationRequested)
                {
                    var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
                    if (line is null) break;
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    if (line.Length > 20 * 1024 * 1024)
                    {
                        await WriteLineAsync(writer, new { ok = false, error = "Payload too large" }).ConfigureAwait(false);
                        break;
                    }

                    JsonElement req;
                    try
                    {
                        req = JsonDocument.Parse(line).RootElement;
                    }
                    catch
                    {
                        await WriteLineAsync(writer, new { ok = false, error = "Invalid JSON" }).ConfigureAwait(false);
                        continue;
                    }

                    var op = req.TryGetProperty("op", out var opEl) ? opEl.GetString() : null;
                    var reqToken = req.TryGetProperty("token", out var tokEl) ? tokEl.GetString() : null;
                    if (!string.Equals(reqToken, _authToken, StringComparison.Ordinal))
                    {
                        await WriteLineAsync(writer, new { ok = false, error = "Unauthorized" }).ConfigureAwait(false);
                        continue;
                    }
                    if (op == "subscribe")
                    {
                        subscriberId = Guid.NewGuid();
                        _subscribers[subscriberId.Value] = writer;
                        var snapshot = await _engine.GetSnapshotAsync(cancellationToken).ConfigureAwait(false);
                        await WriteLineAsync(writer, new { ok = true, @event = "subscribed", snapshot, logs = _logs.Snapshot() }).ConfigureAwait(false);
                        continue;
                    }

                    object response;
                    try
                    {
                        response = await DispatchAsync(op, req, cancellationToken).ConfigureAwait(false);
                    }
                    catch (Exception ex)
                    {
                        _log.LogWarning(ex, "Bridge op '{Op}' failed", op);
                        response = new { ok = false, error = ex.Message };
                    }
                    await WriteLineAsync(writer, response).ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (IOException) { }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Client connection closed");
        }
        finally
        {
            if (subscriberId is { } id)
                _subscribers.TryRemove(id, out _);
        }
    }

    private async Task<object> DispatchAsync(string? op, JsonElement req, CancellationToken ct)
    {
        switch (op)
        {
            case "ping":
                return new { ok = true, service = "NitroHubService", engineState = _engine.State.ToString() };

            case "snapshot":
            {
                var snapshot = await _engine.GetSnapshotAsync(ct).ConfigureAwait(false);
                return new { ok = true, snapshot };
            }

            case "telemetry":
            {
                var snapshot = await _engine.GetSnapshotAsync(ct).ConfigureAwait(false);
                return new { ok = true, telemetry = snapshot.Latest };
            }

            case "set-profile":
            {
                var profile = DeserializeRequired<ControlProfile>(req, "profile");
                await _engine.SetProfileAsync(profile, ct).ConfigureAwait(false);
                return new { ok = true };
            }

            case "set-lighting":
            {
                var lighting = DeserializeRequired<LightingConfig>(req, "lighting");
                await _engine.SetLightingAsync(lighting, ct).ConfigureAwait(false);
                return new { ok = true };
            }

            case "set-keyboard":
            {
                var keyboard = DeserializeRequired<KeyboardSettings>(req, "keyboard");
                await _engine.SetKeyboardAsync(keyboard, ct).ConfigureAwait(false);
                return new { ok = true };
            }

            case "set-power":
            {
                var power = DeserializeRequired<PowerSettings>(req, "power");
                await _engine.SetPowerAsync(power, ct).ConfigureAwait(false);
                return new { ok = true };
            }

            case "set-gpu-mode":
            {
                var modeStr = req.TryGetProperty("mode", out var m) ? m.GetString() : null;
                if (!Enum.TryParse<GpuMode>(modeStr, ignoreCase: true, out var mode))
                    throw new ArgumentException($"Invalid GPU mode: {modeStr}");
                var ok = await _engine.SetGpuModeAsync(mode, ct).ConfigureAwait(false);
                return new { ok };
            }

            case "start-dust-defender":
            {
                var result = await _engine.StartDustDefenderAsync(ct).ConfigureAwait(false);
                return new { ok = result == DustDefenderStart.Started, result = result.ToString() };
            }

            case "read-battery-health":
            {
                var health = await _engine.ReadBatteryHealthAsync(ct).ConfigureAwait(false);
                return new { ok = true, health };
            }

            case "set-overrides":
            {
                var overrides = DeserializeRequired<CapabilityOverrides>(req, "overrides");
                await _engine.SetOverridesAsync(overrides, ct).ConfigureAwait(false);
                return new { ok = true };
            }

            case "get-diagnostics":
            {
                var diagnostics = await _engine.GetDiagnosticsAsync(ct).ConfigureAwait(false);
                return new { ok = true, diagnostics };
            }

            case "hackbgrt-status":
                return await Task.Run(ReadHackbgrtStatus, ct).ConfigureAwait(false);

            case "hackbgrt-apply":
            {
                var bmpBase64 = req.TryGetProperty("bmpBase64", out var bEl) ? bEl.GetString() : null;
                if (string.IsNullOrWhiteSpace(bmpBase64))
                    return new { ok = false, msg = "Missing BMP payload" };
                byte[] bmpBytes;
                try { bmpBytes = Convert.FromBase64String(bmpBase64); }
                catch { return new { ok = false, msg = "Invalid BMP encoding" }; }
                if (bmpBytes.Length < 54 || bmpBytes.Length > 25 * 1024 * 1024 || bmpBytes[0] != (byte)'B' || bmpBytes[1] != (byte)'M')
                    return new { ok = false, msg = "Invalid BMP header or size" };
                return await Task.Run(() => WriteHackbgrtSplash(bmpBytes), ct).ConfigureAwait(false);
            }

            case "get-sense-key-override":
                return await Task.Run(GetSenseKeyOverride, ct).ConfigureAwait(false);

            case "set-sense-key-override":
            {
                var enabled = req.TryGetProperty("enabled", out var enEl) && enEl.ValueKind == JsonValueKind.True;
                var appPath = req.TryGetProperty("appPath", out var apEl) ? apEl.GetString() : null;
                return await Task.Run(() => SetSenseKeyOverride(enabled, appPath), ct).ConfigureAwait(false);
            }

            default:
                return new { ok = false, error = $"Unknown operation: {op}" };
        }
    }

    private static readonly string[] SenseLauncherExes =
    [
        "NitroSense.exe",
        "PredatorSense.exe",
        "AcerSense.exe",
        "PSLauncher.exe",
        "NitroSenseLauncher.exe",
        "PredatorSenseLauncher.exe",
    ];

    private const string IfeoRoot = @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options";

    private static object GetSenseKeyOverride()
    {
        try
        {
            foreach (var exe in SenseLauncherExes)
            {
                using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey($@"{IfeoRoot}\{exe}");
                var dbg = key?.GetValue("Debugger") as string;
                if (!string.IsNullOrWhiteSpace(dbg) && dbg.Contains("Nitro Hub", StringComparison.OrdinalIgnoreCase))
                    return new { ok = true, enabled = true };
            }
            return new { ok = true, enabled = false };
        }
        catch (Exception ex)
        {
            return new { ok = false, enabled = false, error = ex.Message };
        }
    }

    private static object SetSenseKeyOverride(bool enabled, string? appPath)
    {
        try
        {
            if (enabled)
            {
                if (string.IsNullOrWhiteSpace(appPath) || !appPath.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(appPath))
                    return new { ok = false, error = "Invalid Nitro Hub executable path." };

                var cmd = $"\"{appPath}\"";
                foreach (var exe in SenseLauncherExes)
                {
                    using var key = Microsoft.Win32.Registry.LocalMachine.CreateSubKey($@"{IfeoRoot}\{exe}");
                    key.SetValue("Debugger", cmd, Microsoft.Win32.RegistryValueKind.String);
                }
                return new { ok = true, enabled = true };
            }

            foreach (var exe in SenseLauncherExes)
            {
                using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey($@"{IfeoRoot}\{exe}", writable: true);
                if (key is null) continue;
                var dbg = key.GetValue("Debugger") as string;
                if (!string.IsNullOrWhiteSpace(dbg) && dbg.Contains("Nitro Hub", StringComparison.OrdinalIgnoreCase))
                    key.DeleteValue("Debugger", throwOnMissingValue: false);
            }
            return new { ok = true, enabled = false };
        }
        catch (Exception ex)
        {
            return new { ok = false, error = ex.Message };
        }
    }

    private static object WriteHackbgrtSplash(byte[] bmpBytes)
    {
        try
        {
            var used = DriveInfo.GetDrives().Select(d => char.ToUpperInvariant(d.Name[0])).ToHashSet();
            char? letter = null;
            for (char c = 'G'; c <= 'Z'; c++)
            {
                if (!used.Contains(c)) { letter = c; break; }
            }
            if (letter is not { } drv)
                return new { ok = false, msg = "No free drive letter to mount EFI partition." };

            using (var mount = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "mountvol.exe",
                Arguments = $"{drv}: /S",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            }))
            {
                mount?.WaitForExit(3000);
            }

            try
            {
                var hackDir = $"{drv}:\\EFI\\HackBGRT";
                if (!Directory.Exists(hackDir))
                    return new { ok = false, notInstalled = true, msg = "HackBGRT is not installed on your EFI partition." };
                File.WriteAllBytes(Path.Combine(hackDir, "splash.bmp"), bmpBytes);
                return new { ok = true, msg = "Boot logo updated! Takes effect on next restart." };
            }
            finally
            {
                using var unmount = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "mountvol.exe",
                    Arguments = $"{drv}: /D",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                });
                unmount?.WaitForExit(3000);
            }
        }
        catch (Exception ex)
        {
            return new { ok = false, msg = $"Error: {ex.Message}" };
        }
    }

    private static object ReadHackbgrtStatus()
    {
        bool installed = false;
        bool hasSplash = false;
        bool bgrtEntry = false;
        string? splashBase64 = null;
        string? error = null;

        try
        {
            using (var bcd = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "bcdedit.exe",
                Arguments = "/enum firmware",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            }))
            {
                if (bcd != null)
                {
                    var fw = bcd.StandardOutput.ReadToEnd();
                    bcd.WaitForExit(3000);
                    if (fw.Contains("HackBGRT", StringComparison.OrdinalIgnoreCase))
                        bgrtEntry = true;
                }
            }

            var used = DriveInfo.GetDrives().Select(d => char.ToUpperInvariant(d.Name[0])).ToHashSet();
            char? letter = null;
            for (char c = 'G'; c <= 'Z'; c++)
            {
                if (!used.Contains(c)) { letter = c; break; }
            }

            if (letter is { } drv)
            {
                using (var mount = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "mountvol.exe",
                    Arguments = $"{drv}: /S",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                }))
                {
                    mount?.WaitForExit(3000);
                }

                try
                {
                    var hackDir = $"{drv}:\\EFI\\HackBGRT";
                    if (Directory.Exists(hackDir))
                    {
                        installed = true;
                        var splashPath = Path.Combine(hackDir, "splash.bmp");
                        if (File.Exists(splashPath))
                        {
                            hasSplash = true;
                            splashBase64 = Convert.ToBase64String(File.ReadAllBytes(splashPath));
                        }
                    }
                }
                finally
                {
                    using var unmount = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "mountvol.exe",
                        Arguments = $"{drv}: /D",
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                    });
                    unmount?.WaitForExit(3000);
                }
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }

        return new { ok = true, installed, bgrtEntry, hasSplash, splashBase64, error };
    }

    private static T DeserializeRequired<T>(JsonElement req, string propertyName)
    {
        if (!req.TryGetProperty(propertyName, out var el))
            throw new ArgumentException($"Missing '{propertyName}' payload");
        return JsonSerializer.Deserialize<T>(el.GetRawText(), JsonOptions)
            ?? throw new ArgumentException($"Invalid '{propertyName}' payload");
    }

    private static readonly SemaphoreSlim WriteGate = new(1, 1);

    private static async Task WriteLineAsync(StreamWriter writer, object payload)
    {
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        await WriteGate.WaitAsync().ConfigureAwait(false);
        try
        {
            await writer.WriteLineAsync(json).ConfigureAwait(false);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    private void Broadcast(string eventName, object data)
    {
        if (_subscribers.IsEmpty) return;
        var json = JsonSerializer.Serialize(new { @event = eventName, data }, JsonOptions);
        foreach (var (id, writer) in _subscribers)
        {
            try
            {
                lock (writer)
                {
                    writer.WriteLine(json);
                }
            }
            catch
            {
                _subscribers.TryRemove(id, out _);
            }
        }
    }

    private void OnTelemetryUpdated(object? sender, Telemetry e) => Broadcast("telemetry", e);
    private void OnNoticeRaised(object? sender, ControlNotice e) => Broadcast("notice", e);
    private void OnRebuilt(object? sender, EngineSnapshot e) => Broadcast("rebuilt", e);
    private void OnSettingsChanged(object? sender, MachineSettings e) => Broadcast("settings", e);
    private void OnDebugLog(DebugLogEntry entry) => Broadcast("log", entry);

    public void Dispose()
    {
        _engine.TelemetryUpdated -= OnTelemetryUpdated;
        _engine.NoticeRaised -= OnNoticeRaised;
        _engine.Rebuilt -= OnRebuilt;
        _engine.SettingsChanged -= OnSettingsChanged;
        _logs.OnLog -= OnDebugLog;
        _subscribers.Clear();
    }
}
