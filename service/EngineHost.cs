using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using AcerCrate.Core.Engine;
using AcerCrate.Core.Ipc;

namespace NitroHub.Service;

/// <summary>
/// Starts CrateEngine, runs the TCP JSON-lines bridge for Electron, and restores firmware fan control on stop.
/// </summary>
internal sealed class EngineHost(CrateEngine engine, TcpBridgeServer bridge, ILogger<EngineHost> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var serving = bridge.RunAsync(stoppingToken);
        await Task.Run(engine.Start, stoppingToken).ConfigureAwait(false);
        log.LogInformation("HubEngine started with state: {State}", engine.State);

        try
        {
            await serving.ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            log.LogCritical(ex, "TCP bridge failed");
            throw;
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken).ConfigureAwait(false);
        engine.Dispose();
        log.LogInformation("NitroHubService stopped");
    }
}
