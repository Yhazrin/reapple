import SwiftUI

@main
struct ReappleManagerApp: App {
    @NSApplicationDelegateAdaptor(ManagerAppDelegate.self) private var delegate
    @State private var model = ManagerModel.shared

    var body: some Scene {
        MenuBarExtra {
            ManagerMenuView(model: model)
        } label: {
            Image(systemName: "music.note")
                .accessibilityLabel("Reapple Music")
        }
        .menuBarExtraStyle(.menu)
    }
}
