import AVFoundation
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

    final class Coordinator: NSObject, WKScriptMessageHandler, AVAudioPlayerDelegate {
        weak var webView: WKWebView?
        private var endedMusicDecks: Set<Int> = []
        private var musicPlayers: [Int: AVAudioPlayer] = [:]
        private let musicTracks: Set<String> = [
            "menu", "peace_day_1", "peace_day_2", "night_lantern", "battle_skirmish",
            "battle_siege", "victory", "defeat"
        ]
        private let lanManager = LanSessionManager()

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else { return }

            let data = body["data"] as? [String: Any]
            switch type {
            case "haptic":
                let style = data?["style"] as? String ?? "light"
                HapticsManager.shared.trigger(style: style)
            case "music_deck":
                if let data { handleMusicDeck(data) }
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
        func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
            if let deck = musicPlayers.first(where: { $0.value === player })?.key {
                endedMusicDecks.insert(deck)
            }
        }

        private func handleMusicDeck(_ data: [String: Any]) {
            guard let deck = data["deck"] as? Int, (0...1).contains(deck),
                  let action = data["action"] as? String else { return }

            switch action {
            case "load":
                endedMusicDecks.remove(deck)
                musicPlayers.removeValue(forKey: deck)?.stop()
                guard let track = data["track"] as? String, musicTracks.contains(track),
                      let root = Bundle.main.url(forResource: "WebBundle", withExtension: nil),
                      let player = try? AVAudioPlayer(contentsOf: root.appendingPathComponent("audio/bgm_\(track).m4a"))
                else { return }
                player.delegate = self
                player.volume = 0
                player.numberOfLoops = data["loop"] as? Bool == true ? -1 : 0
                player.prepareToPlay()
                musicPlayers[deck] = player
            case "volume":
                if let volume = data["volume"] as? Double, volume.isFinite {
                    musicPlayers[deck]?.volume = Float(min(1, max(0, volume)))
                }
            case "pause":
                musicPlayers[deck]?.pause()
            case "resume":
                if !endedMusicDecks.contains(deck) { musicPlayers[deck]?.play() }
            case "clear":
                musicPlayers.removeValue(forKey: deck)?.stop()
            default:
                break
            }
        }
    }
}
