using System.ServiceProcess;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using AcerCrate.Core.Engine;

namespace NitroHub.Service;

/// <summary>
/// Windows service lifetime that forwards suspend, resume, and AC/battery power events to CrateEngine.
/// </summary>
internal sealed class PowerAwareServiceLifetime : WindowsServiceLifetime
{
    private readonly CrateEngine _engine;

    public PowerAwareServiceLifetime(
        CrateEngine engine,
        IHostEnvironment environment,
        IHostApplicationLifetime applicationLifetime,
        ILoggerFactory loggerFactory,
        IOptions<HostOptions> optionsAccessor,
        IOptions<WindowsServiceLifetimeOptions> windowsServiceOptionsAccessor)
        : base(environment, applicationLifetime, loggerFactory, optionsAccessor, windowsServiceOptionsAccessor)
    {
        _engine = engine;
        CanHandlePowerEvent = true;
    }

    protected override bool OnPowerEvent(PowerBroadcastStatus powerStatus)
    {
        switch (powerStatus)
        {
            case PowerBroadcastStatus.Suspend:
                _engine.NotifySuspend();
                break;
            case PowerBroadcastStatus.ResumeAutomatic:
                _engine.NotifyResume();
                break;
            case PowerBroadcastStatus.PowerStatusChange:
                _engine.NotifyPowerSourceChanged();
                break;
        }
        return base.OnPowerEvent(powerStatus);
    }
}
