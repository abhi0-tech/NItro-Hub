using System.ServiceProcess;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NitroHub.Core.Engine;

namespace NitroHub.Service;

/// <summary>
/// Windows service lifetime that forwards suspend, resume, and AC/battery power events to HubEngine.
/// </summary>
internal sealed class PowerAwareServiceLifetime : WindowsServiceLifetime
{
    private readonly HubEngine _engine;

    public PowerAwareServiceLifetime(
        HubEngine engine,
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
