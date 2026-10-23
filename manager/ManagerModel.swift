import Foundation
import Observation
import AppKit
import ServiceManagement

@MainActor @Observable
final class ManagerModel {
    static let shared = ManagerModel()
    var page = 0
    var showUninstallGuide = false
    var installationNeedsRecovery = false
    var installed = false
    var enabled = false
    var busy = false
    var message = ""
    var failure = false
    var details = ""
    var config: [String: Bool] = [:]
    var automaticRequested = UserDefaults.standard.bool(forKey: "automaticFollow")
    var loginEnabled = false
    var loginApprovalRequired = false
    var pendingRestart = false
    var quitting = false
    private var watcher: Process?
    private var monitor: Task<Void, Never>?
    let home = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".reapple")
    var source: URL { Bundle.main.resourceURL!.appendingPathComponent("runtime") }
    var cli: URL { source.appendingPathComponent("bin/reapple") }
    var statusText: String {
        if installationNeedsRecovery { return "安装未完成 · 需要恢复" }
        if !installed { return "尚未安装组件" }
        if !enabled { return "增强已暂停" }
        if pendingRestart { return "等待确认重启 · 播放未受影响" }
        return NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == "com.netease.163music" || $0.executableURL?.lastPathComponent == "NeteaseMusic" }
            ? "增强服务运行中" : "等待网易云打开"
    }

    nonisolated static func execute(_ executable: String, _ arguments: [String], environment: [String: String] = [:]) async -> CommandResult {
        await Task.detached {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            var env = ProcessInfo.processInfo.environment
            env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
            env.merge(environment) { _, new in new }
            process.environment = env
            let pipe = Pipe()
            process.standardOutput = pipe; process.standardError = pipe
            do {
                try process.run()
                let bytes = pipe.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                return CommandResult(code: process.terminationStatus, output: String(decoding: bytes, as: UTF8.self))
            } catch { return CommandResult(code: -1, output: error.localizedDescription) }
        }.value
    }

    func refresh() async {
        installationNeedsRecovery = FileManager.default.fileExists(atPath: home.appendingPathComponent(".install-lock").path)
        installed = FileManager.default.fileExists(atPath: home.appendingPathComponent("runtime/bin/reapple").path)
        enabled = watcher?.isRunning == true && !FileManager.default.fileExists(atPath: home.appendingPathComponent("disabled").path)
        pendingRestart = enabled && FileManager.default.fileExists(atPath: home.appendingPathComponent("pending-restart").path)
        loginEnabled = SMAppService.mainApp.status == .enabled
        loginApprovalRequired = SMAppService.mainApp.status == .requiresApproval
        if let data = try? Data(contentsOf: home.appendingPathComponent("config.json")),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            config = object.compactMapValues { $0 as? Bool }
        }
    }

    func launch() async {
        await refresh()
        let legacy = await Self.execute("/bin/launchctl", ["print", "gui/\(getuid())/com.reapple.music"])
        let wasActive = legacy.code == 0 && !FileManager.default.fileExists(atPath: home.appendingPathComponent("disabled").path)
        // Adopt an already-enabled legacy session without registering login items or restarting music.
        if installed && (wasActive || (automaticRequested && !UserDefaults.standard.bool(forKey: "enhancementPaused"))) {
            await beginSession()
        }
        monitor = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { return }
                await self?.refresh()
            }
        }
    }

    func value(_ key: String) -> Bool { config[key] ?? (key != "showTrackVIP") }

    private func beginSession() async {
        guard installed && !installationNeedsRecovery else { return }
        let result = await Self.execute("/bin/bash", [cli.path, "managed-session"])
        details = result.output
        guard result.code == 0 else { failure = true; message = "无法启用增强，请查看详情。"; return }
        if watcher?.isRunning != true {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/bash")
            process.arguments = [source.appendingPathComponent("agent/watch.sh").path]
            var env = ProcessInfo.processInfo.environment
            env["REAPPLE_HOME"] = home.path
            env["REAPPLE_OWNER_PID"] = String(ProcessInfo.processInfo.processIdentifier)
            env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
            process.environment = env
            process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
            do { try process.run(); watcher = process; failure = false; message = "" }
            catch { failure = true; message = "后台服务未能启动。"; details = error.localizedDescription }
        }
        await refresh()
    }

    private func stopWatcher() async {
        // Disable before stopping, so an in-flight injection cannot re-enable itself.
        try? Data().write(to: home.appendingPathComponent("disabled"))
        if let process = watcher, process.isRunning {
            process.terminate()
            await Task.detached { process.waitUntilExit() }.value
        }
        watcher = nil
    }

    func setEnabled(_ value: Bool) {
        guard !busy else { return }
        busy = true
        UserDefaults.standard.set(!value, forKey: "enhancementPaused")
        Task {
            if value { await beginSession() }
            else {
                await stopWatcher()
                let result = await Self.execute("/bin/bash", [cli.path, "off"])
                details = result.output; failure = result.code != 0
                message = failure ? "暂停未完成，请查看详情。" : ""
                await refresh()
            }
            busy = false
        }
    }

    func setAutomatic(_ value: Bool) {
        guard !busy else { return }
        busy = true
        Task {
            do {
                if value { try SMAppService.mainApp.register() }
                else { try await SMAppService.mainApp.unregister() }
                automaticRequested = value
                UserDefaults.standard.set(value, forKey: "automaticFollow")
                failure = false; message = ""
                if value && installed && !UserDefaults.standard.bool(forKey: "enhancementPaused") { await beginSession() }
                // Manual mode changes next-login behavior; it does not interrupt the current music session.
            } catch {
                failure = true; message = "启动方式未更改，请查看详情。"; details = error.localizedDescription
            }
            await refresh(); busy = false
        }
    }

    func openLoginSettings() { SMAppService.openSystemSettingsLoginItems() }

    func recoverInstallation() {
        guard !busy else { return }
        busy = true; message = "正在恢复原有组件…"
        Task {
            let result = await Self.execute("/bin/bash", [source.appendingPathComponent("install.sh").path, "--recover"], environment: ["REAPPLE_START": "0"])
            details = result.output; failure = result.code != 0
            await refresh()
            message = failure ? "恢复未完成，备份已保留。请查看详情。" : "已恢复，可重新安装或启用增强。"
            busy = false
        }
    }

    func install() {
        guard !busy && !installationNeedsRecovery else { return }
        let wasEnabled = enabled
        busy = true; message = "正在安装组件…"
        Task {
            await stopWatcher()
            let result = await Self.execute("/bin/bash", [source.appendingPathComponent("install.sh").path], environment: ["REAPPLE_START": "0"])
            details = result.output; failure = result.code != 0
            await refresh()
            message = failure ? "安装未完成，请查看详情。" : "已安装，可开启界面增强。"
            let installFailed = result.code != 0
            let shouldResume = installed && !installationNeedsRecovery &&
                (wasEnabled || (!installFailed && automaticRequested && !UserDefaults.standard.bool(forKey: "enhancementPaused")))
            if shouldResume {
                await beginSession()
                if installFailed {
                    // beginSession updates status; never hide the failed installation behind it.
                    let resumeDetails = details
                    failure = true
                    message = enabled ? "安装未完成，已恢复原有增强。" : "安装未完成，增强未恢复。请查看详情。"
                    details = result.output + "\n恢复服务：\n" + resumeDetails
                }
            }
            busy = false
        }
    }

    func set(_ key: String, _ value: Bool) {
        guard !busy else { return }; busy = true
        Task {
            let result = await Self.execute("/bin/bash", [cli.path, "config", key, value ? "on" : "off"])
            details = result.output; failure = result.code != 0
            message = failure ? "设置未保存，请查看详情。" : ""
            await refresh(); busy = false
        }
    }

    func uninstall() {
        guard !busy else { return }; busy = true
        Task {
            do {
                if SMAppService.mainApp.status != .notRegistered { try await SMAppService.mainApp.unregister() }
            } catch {
                failure = true; message = "请先关闭登录启动，再卸载。"; details = error.localizedDescription; busy = false; return
            }
            automaticRequested = false; UserDefaults.standard.set(false, forKey: "automaticFollow")
            await stopWatcher()
            let result = await Self.execute("/bin/bash", [cli.path, "uninstall"])
            details = result.output; failure = result.code != 0
            message = failure ? "卸载未完成，请查看详情。" : "组件已移除。"
            await refresh(); busy = false
        }
    }

    func openMusic() {
        guard !busy else { return }
        if !enabled {
            NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: "/Applications/NeteaseMusic.app"), configuration: .init()) { _, _ in }
            return
        }
        busy = true
        Task {
            let result = await Self.execute("/bin/bash", [cli.path, "open"])
            details = result.output
            failure = result.code != 0 && result.code != 2
            message = result.code == 2 ? "播放未中断；可确认重启后启用增强。" : failure ? "未能打开网易云。" : ""
            await refresh(); busy = false
        }
    }

    func confirmRestart() {
        guard !busy else { return }
        let alert = NSAlert()
        alert.messageText = "重启网易云以启用增强？"
        alert.informativeText = "当前播放会中断。也可以取消，之后从 Reapple 菜单打开网易云。"
        alert.addButton(withTitle: "重启网易云"); alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        busy = true
        Task {
            let result = await Self.execute("/bin/bash", [cli.path, "restart-host"])
            details = result.output; failure = result.code != 0
            message = failure ? "重启未完成，请查看详情。" : ""
            await refresh(); busy = false
        }
    }

    func finishOnboarding() {
        UserDefaults.standard.set(true, forKey: "onboardingComplete")
        ManagerAppDelegate.current?.hideWindow()
    }

    func shutdown() async {
        quitting = true; monitor?.cancel()
        // Stop this process's session only; leave the user's auto/manual preference intact.
        if watcher != nil {
            await stopWatcher()
            _ = await Self.execute("/bin/bash", [cli.path, "off"])
        }
    }
}
