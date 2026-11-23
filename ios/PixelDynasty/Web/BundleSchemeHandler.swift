import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the compiled Vite/Phaser 3 WebBundle completely offline under `app://local/`.
/// Satisfies Apple App Store Guideline 4.2 by bundling all game code and assets locally.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let bundleRoot: URL

    override init() {
        self.bundleRoot = Bundle.main.url(forResource: "WebBundle", withExtension: nil)
            ?? Bundle.main.bundleURL
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        let relativePath = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let fileURL = bundleRoot.appendingPathComponent(relativePath)

        guard let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let mimeType = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"

        let response = URLResponse(
            url: url,
            mimeType: mimeType,
            expectedContentLength: data.count,
            textEncodingName: mimeType.hasPrefix("text/") ? "utf-8" : nil
        )
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
