using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace NitroHub.Service;

internal sealed record DebugLogEntry(string Timestamp, string Level, string Category, string Message);

/// <summary>
/// Captures recent service and CrateEngine log entries in memory and notifies subscribers.
/// </summary>
internal sealed class DebugLogBuffer
{
    private const int MaxEntries = 200;
    private readonly ConcurrentQueue<DebugLogEntry> _entries = new();

    public event Action<DebugLogEntry>? OnLog;

    public void Add(LogLevel level, string category, string message)
    {
        var shortCat = category.Split('.').LastOrDefault() ?? category;
        if (string.Equals(shortCat, "CrateEngine", StringComparison.OrdinalIgnoreCase))
            shortCat = "HubEngine";
        var entry = new DebugLogEntry(
            DateTime.Now.ToString("HH:mm:ss.fff"),
            level.ToString(),
            shortCat,
            message);
        _entries.Enqueue(entry);
        while (_entries.Count > MaxEntries)
            _entries.TryDequeue(out _);
        OnLog?.Invoke(entry);
    }

    public IReadOnlyList<DebugLogEntry> Snapshot() => [.. _entries];
}

internal sealed class DebugLogProvider(DebugLogBuffer buffer) : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName) => new BufferLogger(buffer, categoryName);
    public void Dispose() { }

    private sealed class BufferLogger(DebugLogBuffer buffer, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            var msg = formatter(state, exception);
            if (exception is not null)
                msg = $"{msg} | {exception.GetType().Name}: {exception.Message}";
            buffer.Add(logLevel, category, msg);
        }
    }
}
