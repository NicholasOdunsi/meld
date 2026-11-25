import Foundation

protocol PreviewEditRunning: Sendable {
    func run(_ request: Data) async -> Data?
}

/// Runs the bundled edit helper with the same Node runtime the preview server uses.
/// Returns nil on a launch failure, a 10-second timeout, a non-zero exit, or an empty reply.
struct PreviewEditHelper: PreviewEditRunning {
    let node: URL

    /// `Process` is not Sendable; it is only touched by the one blocking job and its timeout item.
    private final class Job: @unchecked Sendable {
        let process = Process()
    }

    func run(_ request: Data) async -> Data? {
        guard let script = PreviewEditResources.url("edit-helper.mjs") else { return nil }
        let node = node
        return await withCheckedContinuation { continuation in
            DispatchQueue.global().async {
                let job = Job()
                let process = job.process
                process.executableURL = node
                process.arguments = [script.path]
                let input = Pipe(), output = Pipe()
                process.standardInput = input
                process.standardOutput = output
                process.standardError = FileHandle.nullDevice
                do { try process.run() } catch { continuation.resume(returning: nil); return }
                // Started before the write so a helper that never reads stdin cannot hang us.
                let timeout = DispatchWorkItem { if job.process.isRunning { job.process.terminate() } }
                DispatchQueue.global().asyncAfter(deadline: .now() + 10, execute: timeout)
                // A helper that exits early must not turn the write into a SIGPIPE or an exception.
                _ = fcntl(input.fileHandleForWriting.fileDescriptor, F_SETNOSIGPIPE, 1)
                try? input.fileHandleForWriting.write(contentsOf: request)
                try? input.fileHandleForWriting.close()
                let data = output.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                timeout.cancel()
                continuation.resume(returning: process.terminationStatus == 0 && !data.isEmpty ? data : nil)
            }
        }
    }
}
