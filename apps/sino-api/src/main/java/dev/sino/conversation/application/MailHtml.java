package dev.sino.conversation.application;

import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;

import org.jsoup.Jsoup;
import org.jsoup.nodes.DataNode;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.safety.Cleaner;
import org.jsoup.safety.Safelist;

/**
 * The HTML of a mail made safe to show (F06, D-120, D-121): only the tags and attributes a mail needs for its layout,
 * links to the web, a mailbox or a phone that open apart from Sino, pictures from the web, from inside the mail
 * ({@code data:} PNG, JPEG, GIF, WebP) or embedded ones served by Sino. The web shows the result in a sandboxed frame
 * that runs no script, a second wall should this one miss something. CSS is kept as written: the frame's Content
 * Security Policy keeps it from loading anything from the web until the user asks for pictures, though it may still
 * ask Sino for a picture of a conversation, as embedded pictures do.
 */
final class MailHtml {

    private static final Safelist SAFELIST = safelist();
    private static final Pattern DATA_IMAGE = Pattern.compile("data:image/(png|jpeg|gif|webp)[;,].*",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    // Both slashes: the browser reads "https:/api/x" as a path of the page that shows the mail, that is of Sino.
    private static final Pattern WEB_URL = Pattern.compile("https?://.*", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    // An address on the web anywhere in CSS: url(...), image-set(...), with or without its scheme.
    private static final Pattern REMOTE_CSS = Pattern.compile("(https?:)?//", Pattern.CASE_INSENSITIVE);
    private static final Pattern STYLE_END = Pattern.compile("</style", Pattern.CASE_INSENSITIVE);

    private MailHtml() {
    }

    /**
     * @param inlineImages where Sino serves the embedded picture with a Content-ID; empty leaves the picture out
     */
    static Clean clean(String html, Function<String, Optional<String>> inlineImages) {
        Document dirty = Jsoup.parse(html);
        // The cleaner keeps the body only; a mail's styles mostly sit in its head, in an order that matters.
        dirty.body().insertChildren(0, dirty.head().select("style"));
        Document clean = new Cleaner(SAFELIST).clean(dirty);
        clean.select("style").forEach(MailHtml::keepCssOnly);
        clean.select("a[href]").forEach(link -> {
            String href = link.attr("href");
            if (href.regionMatches(true, 0, "http", 0, 4) && !WEB_URL.matcher(href).matches()) {
                link.removeAttr("href");
            }
        });
        clean.select("[background]").stream().filter(element -> !WEB_URL.matcher(element.attr("background")).matches())
                .forEach(element -> element.removeAttr("background"));
        for (Element image : clean.select("img")) {
            String src = image.attr("src");
            if (src.regionMatches(true, 0, "cid:", 0, 4)) {
                inlineImages.apply(src.substring(4)).ifPresentOrElse(url -> image.attr("src", url), image::remove);
            } else if (!(isData(src) ? DATA_IMAGE : WEB_URL).matcher(src).matches()) {
                image.remove();
            }
        }
        clean.outputSettings().prettyPrint(false);
        return new Clean(clean.body().html(), remoteImages(clean));
    }

    // Inside SVG or MathML the parser reads markup in a style, and the cleaner keeps what is safe of it; written out
    // again, a tag or a "</style" there would be read as markup by the browser. A style keeps its CSS text only.
    private static void keepCssOnly(Element style) {
        String css = style.data();
        if (STYLE_END.matcher(css).find()) {
            style.remove();
        } else {
            style.empty().appendChild(new DataNode(css));
        }
    }

    private static boolean isData(String src) {
        return src.regionMatches(true, 0, "data:", 0, 5);
    }

    // The background attributes left are addresses on the web.
    private static boolean remoteImages(Document clean) {
        return clean.select("img").stream().anyMatch(image -> WEB_URL.matcher(image.attr("src")).matches())
                || !clean.select("[background]").isEmpty()
                || clean.select("[style]").stream().anyMatch(element -> remote(element.attr("style")))
                || clean.select("style").stream().anyMatch(style -> remote(style.data()));
    }

    private static boolean remote(String css) {
        return REMOTE_CSS.matcher(css).find();
    }

    private static Safelist safelist() {
        Safelist safelist = Safelist.relaxed()
                .addTags("center", "font", "style", "hr", "s", "del", "ins", "big", "tt", "mark", "abbr", "address",
                        "section", "article", "header", "footer", "main", "nav", "aside", "figure", "figcaption",
                        "wbr", "bdi", "bdo")
                .addAttributes(":all", "style", "class", "id", "dir", "lang", "title", "align", "valign", "width",
                        "height", "bgcolor", "border", "cellpadding", "cellspacing", "nowrap")
                .addAttributes("font", "color", "face", "size")
                .addAttributes("style", "media")
                .addEnforcedAttribute("a", "target", "_blank")
                .addEnforcedAttribute("a", "rel", "noopener noreferrer")
                .removeProtocols("a", "href", "ftp")
                .addProtocols("a", "href", "tel")
                .addProtocols("img", "src", "cid", "data");
        for (String tag : new String[] { "table", "td", "th", "tr", "div" }) {
            safelist.addAttributes(tag, "background").addProtocols(tag, "background", "http", "https");
        }
        return safelist;
    }

    /** The HTML to show, and whether it has pictures from the web, which the web hides until the user asks. */
    record Clean(String html, boolean remoteImages) {
    }

}
