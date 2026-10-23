import SwiftUI

struct ManagerMenuView: View {
    @Bindable var model: ManagerModel
    var body: some View {
        Text("Reapple Music")
        Text(model.statusText)
        Button(model.enabled ? "暂停增强" : "启用增强") { model.setEnabled(!model.enabled) }
            .disabled(model.busy || !model.installed)
        if model.pendingRestart {
            Button("重启网易云以启用…") { model.confirmRestart() }.disabled(model.busy)
        }
        if model.installationNeedsRecovery {
            Button("恢复未完成的安装…") { ManagerAppDelegate.current?.showWindow(page: 1) }
        }
        Button("打开网易云") { model.openMusic() }.disabled(model.busy)
        Divider()
        Button("设置…") { ManagerAppDelegate.current?.showWindow(page: 2) }
            .keyboardShortcut(",")
        Button("安装与启动…") { ManagerAppDelegate.current?.showWindow(page: 1) }
        Button("卸载指引…") {
            ManagerAppDelegate.current?.showWindow(page: 1)
            model.showUninstallGuide = true
        }.disabled(model.busy)
        Divider()
        Button("退出 Reapple") { NSApplication.shared.terminate(nil) }.keyboardShortcut("q")
        .disabled(model.busy)
    }
}
