import SwiftUI

struct StartupOptionsView: View {
    @Bindable var model: ManagerModel
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("启动方式").font(.system(size: 13, weight: .semibold))
            Picker("启动方式", selection: Binding(get: { model.automaticRequested }, set: { model.setAutomatic($0) })) {
                Text("跟随网易云 · 推荐").tag(true)
                Text("手动启用").tag(false)
            }.pickerStyle(.segmented).labelsHidden().disabled(model.busy)
            Text(model.automaticRequested ? "登录后后台待命，不弹窗；需重启时会先询问。" : "打开 Reapple 后，手动启用本次增强。")
                .font(.system(size: 11)).foregroundStyle(.secondary)
            if model.loginApprovalRequired {
                Button("允许后台运行…") { model.openLoginSettings() }.buttonStyle(.link)
                Text("等待系统允许，自动启动尚未生效。")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            } else if model.automaticRequested && !model.loginEnabled {
                Button("重新启用登录启动") { model.setAutomatic(true) }.buttonStyle(.link)
                Text("系统登录项未启用。")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
        }
    }
}
