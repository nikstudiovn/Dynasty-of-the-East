import Foundation
import Network

/// Local Wi-Fi LAN discovery using Apple's modern Network framework (Bonjour).
final class LanSessionManager {
    private let serviceType = "_dote._tcp"
    private let queue = DispatchQueue(label: "com.nikstudio.dote.lan")
    private var listener: NWListener?
    private var browser: NWBrowser?

    func startHosting(roomName: String) {
        stopAll()
        do {
            let listener = try NWListener(using: .tcp)
            listener.service = NWListener.Service(name: roomName, type: serviceType)
            listener.newConnectionHandler = { connection in
                connection.start(queue: self.queue)
            }
            listener.start(queue: queue)
            self.listener = listener
        } catch {
            // Host startup failure handled silently; UI retries via bridge
        }
    }

    func startBrowsing(onPeersUpdated: @escaping ([String]) -> Void) {
        browser?.cancel()
        let descriptor = NWBrowser.Descriptor.bonjour(type: serviceType, domain: nil)
        let browser = NWBrowser(for: descriptor, using: .tcp)
        browser.browseResultsChangedHandler = { results, _ in
            let names: [String] = results.compactMap { result in
                if case let .service(name: name, type: _, domain: _, interface: _) = result.endpoint {
                    return name
                }
                return nil
            }
            onPeersUpdated(names)
        }
        browser.start(queue: queue)
        self.browser = browser
    }

    func stopAll() {
        listener?.cancel()
        browser?.cancel()
        listener = nil
        browser = nil
    }
}
