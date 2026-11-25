import SwiftUI
import WebKit

struct GameWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "app")

        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "dote")
        config.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.isOpaque = true
        webView.backgroundColor = UIColor(red: 0.11, green: 0.09, blue: 0.08, alpha: 1.0)

        context.coordinator.webView = webView
        if let entryURL = URL(string: "app://local/index.html") {
            webView.load(URLRequest(url: entryURL))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        weak var webView: WKWebView?
        private let lanManager = LanSessionManager()

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else { return }

            let data = body["data"] as? [String: Any]
            switch type {
            case "haptic":
                let style = data?["style"] as? String ?? "light"
                HapticsManager.shared.trigger(style: style)
            case "lan_host":
                let roomName = data?["roomName"] as? String ?? "DOTE"
                lanManager.startHosting(roomName: roomName)
            case "lan_browse":
                lanManager.startBrowsing { [weak self] peers in
                    guard let json = try? JSONSerialization.data(withJSONObject: peers),
                          let str = String(data: json, encoding: .utf8) else { return }
                    DispatchQueue.main.async {
                        self?.webView?.evaluateJavaScript("window.onNativeEvent?.('lan_peers', \(str));")
                    }
                }
            default:
                break
            }
        }
    }
}
