import SwiftUI

struct ManagerView: View {
    @Bindable var model: ManagerModel
    @State private var showDetails = false
    @State private var showAbout = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    private let accent = Color(red: 0.94, green: 0.16, blue: 0.30)
    private let steps = ["简介", "安装", "设置"]

    var body: some View {
        VStack(spacing: 0) {
            navigation.padding(.top, 12).padding(.bottom, 10)
            Group {
                switch model.page {
                case 0: welcome
                case 1: installation
                default: preferences
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            footer.padding(.horizontal, 32).padding(.top, 12).padding(.bottom, 20)
        }
        .frame(width: 560, height: 520)
        .background(Color(nsColor: .windowBackgroundColor))
        .tint(accent)
        .animation(reduceMotion ? nil : .smooth(duration: 0.28), value: model.page)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.refresh() } }
        }
        .sheet(isPresented: $model.showUninstallGuide) {
            UninstallGuideView(model: model)
        }
        .sheet(isPresented: $showDetails) {
            VStack(alignment: .leading, spacing: 20) {
                Text("操作详情").font(.title2.bold())
                ScrollView {
                    Text(model.details).font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                }
                Button("完成") { showDetails = false }.frame(maxWidth: .infinity, alignment: .trailing)
            }.padding(28).frame(width: 520, height: 340)
        }
    }

    private var navigation: some View {
        HStack(spacing: 4) {
            ForEach(steps.indices, id: \.self) { index in
                Button { model.page = index } label: {
                    Text(steps[index]).font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(model.page == index ? .primary : .secondary)
                        .frame(width: 64, height: 30)
                        .background {
                            if model.page == index { Capsule().fill(.quaternary) }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain).disabled(model.busy)
                .accessibilityAddTraits(model.page == index ? .isSelected : [])
            }
        }
        .padding(4)
        .background(.regularMaterial, in: Capsule())
    }

    private static let brandImage: NSImage? = Bundle.main.url(forResource: "ReappleIcon", withExtension: "png")
        .flatMap { NSImage(contentsOf: $0) }

    private func brandIcon(size: CGFloat) -> some View {
        Group {
            if let image = Self.brandImage {
                Image(nsImage: image).resizable().interpolation(.high).scaledToFit()
            } else {
                Image(systemName: "music.note").resizable().scaledToFit().foregroundStyle(accent)
            }
        }.frame(width: size, height: size).accessibilityHidden(true)
    }

    private var welcome: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 12)
            brandIcon(size: 136)
                .shadow(color: accent.opacity(0.13), radius: 22, y: 12)
            Text("Reapple Music")
                .font(.system(size: 30, weight: .bold)).tracking(-0.7)
                .padding(.top, 24)
            Text("网易云音乐界面增强")
                .font(.system(size: 14)).foregroundStyle(.secondary).padding(.top, 8)
            Button("Yhazrin") { showAbout = true }
                .buttonStyle(.plain).font(.system(size: 12)).foregroundStyle(.secondary)
                .padding(.top, 18)
                .popover(isPresented: $showAbout) {
                    VStack(spacing: 8) {
                        Text("制作人 · Yhazrin").font(.headline)
                        Text("独立项目，与 Apple、网易云无隶属关系。")
                            .font(.callout).foregroundStyle(.secondary)
                    }.padding(24)
                }
            Spacer(minLength: 20)
        }
        .frame(maxWidth: .infinity)
    }

    private var installation: some View {
        VStack(spacing: 16) {
            heading("安装 Reapple", "不修改网易云应用文件")
            VStack(spacing: 22) {
                HStack(spacing: 14) {
                    Image(systemName: "shippingbox.fill").font(.title2).foregroundStyle(accent)
                        .frame(width: 36)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(model.installed ? "组件已安装" : "安装组件").font(.headline)
                        Text("已内置运行环境，只需网易云音乐").font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 4)
                    Button(model.installationNeedsRecovery ? "恢复安装" : (model.installed ? "重新安装" : "安装")) {
                        if model.installationNeedsRecovery { model.recoverInstallation() } else { model.install() }
                    }
                        .buttonStyle(.bordered).buttonBorderShape(.capsule).disabled(model.busy)
                }
                HStack(spacing: 14) {
                    Image(systemName: "sparkles").font(.title2).foregroundStyle(accent).frame(width: 36)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("启用界面增强").font(.headline)
                        Text("开启时可能重启网易云").font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Toggle("启用界面增强", isOn: Binding(get: { model.enabled }, set: { model.setEnabled($0) }))
                        .labelsHidden().toggleStyle(.switch).disabled(!model.installed || model.busy)
                }
            }.padding(24).background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 24))
            if model.pendingRestart {
                Button("重启网易云以启用…") { model.confirmRestart() }.buttonStyle(.link)
            }
            Spacer(minLength: 0)
        }.padding(.horizontal, 32).padding(.top, 16)
    }

    private var preferences: some View {
        // Normal settings fit without scrolling. Keep a fallback for system approval messages.
        ViewThatFits(in: .vertical) {
            preferencesContent.fixedSize(horizontal: false, vertical: true)
            ScrollView { preferencesContent }.scrollIndicators(.hidden)
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 8)
    }

    private var preferencesContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("设置").font(.system(size: 24, weight: .bold)).tracking(-0.5)
                Spacer()
                Text("自动保存").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            StartupOptionsView(model: model)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 20))
            VStack(alignment: .leading, spacing: 14) {
                Text("界面增强").font(.system(size: 13, weight: .semibold))
                HStack(spacing: 28) {
                    VStack(spacing: 12) {
                        option("歌曲列表", "appleSongList")
                        option("无边框搜索", "searchFilled")
                    }.frame(maxWidth: .infinity)
                    VStack(spacing: 12) {
                        option("悬浮播放栏", "miniBar")
                        option("播放页", "playPage")
                    }.frame(maxWidth: .infinity)
                }
                HStack(spacing: 16) {
                    Text("列表标记").font(.system(size: 11)).foregroundStyle(.secondary)
                    compactOption("MV", "showTrackMV")
                    compactOption("音质", "showTrackQuality")
                    compactOption("VIP", "showTrackVIP")
                    compactOption("序号", "showTrackNumber")
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 20))
            HStack {
                Text(model.enabled ? "更多选项在网易云设置中" : "启用界面增强后生效")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                if !model.installed {
                    Spacer()
                    Button("安装组件") { model.page = 1 }.buttonStyle(.link).font(.system(size: 11))
                }
            }
        }
    }

    private func heading(_ title: String, _ subtitle: String) -> some View {
        VStack(spacing: 8) {
            Text(title).font(.system(size: 26, weight: .bold)).tracking(-0.5)
            Text(subtitle).font(.system(size: 12)).foregroundStyle(.secondary)
        }.padding(.bottom, 6)
    }

    private var footer: some View {
        VStack(spacing: 12) {
            if model.installationNeedsRecovery && model.page != 1 {
                Button("安装未完成 · 前往恢复") { model.page = 1 }
                    .buttonStyle(.link).font(.system(size: 12))
            }
            if model.busy || !model.message.isEmpty {
                HStack(spacing: 8) {
                    if model.busy { ProgressView().controlSize(.small) }
                    Text(model.message).font(.system(size: 11))
                        .foregroundStyle(model.failure ? .red : .secondary).lineLimit(2)
                    if !model.details.isEmpty {
                        Button("详情") { showDetails = true }.buttonStyle(.plain).font(.system(size: 11))
                    }
                }
            }
            HStack(spacing: 12) {
                if model.page > 0 {
                    Button { model.showUninstallGuide = true } label: {
                        Label("卸载 Reapple…", systemImage: "trash")
                            .font(.system(size: 12, weight: .medium))
                            .frame(height: 22)
                    }
                    .buttonStyle(.bordered).buttonBorderShape(.capsule).controlSize(.large)
                    .foregroundStyle(.red).disabled(model.busy)
                    .help("查看卸载步骤，不会立即删除")
                    Spacer(minLength: 12)
                    Button { model.page -= 1 } label: {
                        Image(systemName: "chevron.left").font(.system(size: 14, weight: .semibold)).frame(width: 22, height: 24)
                    }.buttonStyle(.bordered).buttonBorderShape(.circle)
                        .accessibilityLabel("上一步").disabled(model.busy)
                }
                primaryAction
            }
        }
    }

    private var continueButton: some View {
        Button(action: advance) {
            Text(model.page == 0 ? "继续" : model.page == 1 ? "下一步" : "完成")
                .font(.system(size: 14, weight: .semibold))
                .frame(width: model.page == 0 ? 180 : 90, height: 22)
        }
            .controlSize(model.page == 0 ? .extraLarge : .large).buttonBorderShape(.capsule)
            .disabled(model.busy || (model.page > 0 && !model.installed))
    }

    @ViewBuilder private var primaryAction: some View {
        if #available(macOS 26.0, *) {
            continueButton.buttonStyle(.glassProminent)
        } else {
            continueButton.buttonStyle(.borderedProminent)
        }
    }

    private func advance() {
        if model.page < 2 { model.page += 1 } else { model.finishOnboarding() }
    }

    private func option(_ title: String, _ key: String) -> some View {
        HStack {
            Text(title).font(.system(size: 13, weight: .medium))
            Spacer(minLength: 8)
            Toggle(title, isOn: Binding(get: { model.value(key) }, set: { model.set(key, $0) }))
                .labelsHidden().toggleStyle(.switch).controlSize(.small)
                .disabled(!model.installed || model.busy)
        }
    }

    private func compactOption(_ title: String, _ key: String) -> some View {
        Toggle(title, isOn: Binding(get: { model.value(key) }, set: { model.set(key, $0) }))
            .font(.system(size: 12)).toggleStyle(.checkbox).disabled(!model.installed || model.busy)
    }
}
