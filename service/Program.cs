using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;
using Microsoft.Extensions.Logging;
using AcerCrate.Core.Engine;
using AcerCrate.Core.Settings;
using NitroHub.Service;

// NitroHubService: hosts AcerCrate.Core's CrateEngine as LocalSystem and serves Nitro Hub
// over loopback TCP (127.0.0.1:47631). Registered and started by the NSIS installer.

try
{
    SettingsPaths.SecureMachineDirectory();
}
catch
{
    // Best effort if run unprivileged in dev console mode
}

var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
    DisableDefaults = true,
});

var logBuffer = new DebugLogBuffer();
builder.Logging.AddConsole();
builder.Logging.AddProvider(new DebugLogProvider(logBuffer));
builder.Services.AddSingleton(logBuffer);
builder.Services.AddWindowsService(options => options.ServiceName = "NitroHubService");
if (WindowsServiceHelpers.IsWindowsService())
    builder.Services.AddSingleton<IHostLifetime, PowerAwareServiceLifetime>();

builder.Services.AddSingleton(services => new CrateEngine(
    new WindowsMachine(),
    SettingsPaths.Machine,
    services.GetRequiredService<ILogger<CrateEngine>>()));

builder.Services.AddSingleton<TcpBridgeServer>();
builder.Services.AddHostedService<EngineHost>();

await builder.Build().RunAsync();
