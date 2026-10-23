import SwiftUI

/// Opening this sheet never runs the uninstall command. Removal requires a second confirmation.
struct UninstallGuideView: View {
    @Bindable var model: ManagerModel
    @State private var confirmRemoval = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 8) {
                Text("卸载 Reapple").font(.system(size: 25, weight: .bold))
                Text("网易云和音乐文件会保留。")
                    .font(.callout).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 20) {
                step("1", model.installed ? "先移除组件" : "组件尚未安装",
                     "关闭登录启动与增强服务，删除 Reapple 组件和配置。此操作不可撤销。")
                step("2", "再移除应用", "从菜单栏退出 Reapple，再将应用移到废纸篓。")
                step("3", "方便时重开网易云", "手动退出并重新打开，可清除本次启动的调试参数。")
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 24))
            HStack {
                Button("关闭") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("移除组件…", role: .destructive) { confirmRemoval = true }
                    .disabled(!model.installed || model.busy)
                    .confirmationDialog("移除 Reapple 组件与配置？", isPresented: $confirmRemoval, titleVisibility: .visible) {
                        Button("移除组件与配置", role: .destructive) {
                            dismiss()
                            model.uninstall()
                        }
                        Button("取消", role: .cancel) {}
                    } message: {
                        Text("将关闭登录启动与增强服务，并删除 Reapple 配置。不会删除网易云或音乐文件，也不会自动退出网易云。")
                    }
            }.buttonStyle(.bordered).buttonBorderShape(.capsule)
        }
        .padding(30)
        .frame(width: 500)
    }

    private func step(_ number: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text(number).font(.system(size: 12, weight: .semibold))
                .frame(width: 26, height: 26).background(.quaternary, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.headline)
                Text(detail).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
