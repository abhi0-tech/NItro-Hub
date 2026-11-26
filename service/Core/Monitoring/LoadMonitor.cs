using System.Text.RegularExpressions;
using Windows.Win32.System.Performance;

namespace NitroHub.Core.Monitoring;

public interface ILoadMonitor : IDisposable
{
    string? CpuName { get; }
    string? GpuName { get; }
    int? CpuMhz => null;

    /// <summary>CPU and discrete-GPU utilisation in percent, sampled since the previous call.</summary>
    (double? Cpu, double? Gpu) Sample();
}

/// <summary>CPU load from "% Processor Utility" (matches Task Manager), GPU load from "GPU Engine" 3D counters.</summary>
public sealed partial class LoadMonitor : ILoadMonitor
{
    private readonly PdhQuery _query = new();
    private readonly PDH_HCOUNTER? _cpu;
    private readonly PDH_HCOUNTER? _cpuFreq;
    private readonly PDH_HCOUNTER? _cpuPerf;
    private readonly PDH_HCOUNTER? _gpu3d;
    private readonly GpuAdapter? _discrete;

    public string? CpuName { get; }
    public string? GpuName => _discrete?.Name;
    public int? CpuMhz { get; private set; }

    public LoadMonitor()
    {
        try
        {
            _cpu = _query.Add(@"\Processor Information(_Total)\% Processor Utility")
                ?? _query.Add(@"\Processor(_Total)\% Processor Time");
            _cpuFreq = _query.Add(@"\Processor Information(*)\Processor Frequency")
                ?? _query.Add(@"\Processor Information(_Total)\Processor Frequency");
            _cpuPerf = _query.Add(@"\Processor Information(*)\% Processor Performance")
                ?? _query.Add(@"\Processor Information(_Total)\% Processor Performance");
            _gpu3d = _query.Add(@"\GPU Engine(*engtype_3D)\Utilization Percentage");
            _discrete = GpuAdapters.FindDiscrete(GpuAdapters.TryEnumerate());
            CpuName = ReadCpuName();
            _query.Collect(); // rate counters need a baseline sample
        }
        catch
        {
            _query.Dispose();
            throw;
        }
    }

    public (double? Cpu, double? Gpu) Sample()
    {
        if (!_query.Collect())
            return (null, null);

        double? cpu = _cpu is { } c && PdhQuery.Value(c) is { } v ? Math.Clamp(v, 0, 100) : null;
        if (_cpuFreq is { } f && _cpuPerf is { } p)
        {
            var freqs = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            foreach (var (inst, val) in PdhQuery.Values(f))
            {
                if (!inst.Contains("_Total", StringComparison.OrdinalIgnoreCase) && val > 0)
                    freqs[inst] = val;
            }
            double maxMhz = 0;
            foreach (var (inst, perfVal) in PdhQuery.Values(p))
            {
                if (inst.Contains("_Total", StringComparison.OrdinalIgnoreCase) || perfVal <= 0)
                    continue;
                if (freqs.TryGetValue(inst, out var nom) && nom > 0)
                    maxMhz = Math.Max(maxMhz, nom * (perfVal / 100.0));
            }
            if (maxMhz > 0)
            {
                CpuMhz = (int)Math.Round(maxMhz);
            }
            else if (PdhQuery.Value(f) is { } nominal && PdhQuery.Value(p) is { } perf && nominal > 0 && perf > 0)
            {
                CpuMhz = (int)Math.Round(nominal * (perf / 100.0));
            }
        }
        return (cpu, SampleGpu());
    }

    private double? SampleGpu()
    {
        if (_gpu3d is not { } counter)
            return null;
        var perAdapter = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        foreach (var (instance, value) in PdhQuery.Values(counter))
        {
            var luid = LuidPattern().Match(instance);
            if (luid.Success)
                perAdapter[luid.Value] = perAdapter.GetValueOrDefault(luid.Value) + value;
        }
        if (perAdapter.Count == 0)
            return 0;
        var load = _discrete is not null
            ? perAdapter.GetValueOrDefault(_discrete.CounterLuid)
            : perAdapter.Values.Max();
        return Math.Clamp(load, 0, 100);
    }

    private static string? ReadCpuName()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0");
        return (key?.GetValue("ProcessorNameString") as string)?.Trim();
    }

    [GeneratedRegex("luid_0x[0-9A-Fa-f]{8}_0x[0-9A-Fa-f]{8}")]
    private static partial Regex LuidPattern();

    public void Dispose() => _query.Dispose();
}

/// <summary>Missing performance counters do not prevent firmware temperature and fan control.</summary>
internal sealed class UnavailableLoadMonitor : ILoadMonitor
{
    public string? CpuName => null;
    public string? GpuName => null;
    public (double? Cpu, double? Gpu) Sample() => (null, null);
    public void Dispose() { }
}
