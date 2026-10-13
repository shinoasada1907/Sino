package dev.sino.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The cleaner of mail HTML (F06 spec {@code mail-content}): what an attacker's mail tries (OWASP XSS Filter Evasion
 * Cheat Sheet) never comes out, and what real mail needs for its layout does.
 */
class MailHtmlTests {

    private static final MailHtml.Clean NOTHING = new MailHtml.Clean("", false);

    @ParameterizedTest
    @ValueSource(strings = {
        "<script>alert(1)</script><p>Chào</p>",
        "<p>Chào</p><img src=x onerror=alert(1)>",
        "<svg onload=alert(1)><circle r=1></circle></svg><p>Chào</p>",
        "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>",
        "<iframe srcdoc=\"<script>alert(1)</script>\"></iframe><p>Chào</p>",
        "<frameset><frame src=\"javascript:alert(1)\"></frameset>",
        "<object data=\"javascript:alert(1)\"></object><embed src=\"javascript:alert(1)\">",
        "<form action=\"https://evil.example\"><input name=password autofocus onfocus=alert(1)>"
            + "<button formaction=\"javascript:alert(1)\">Gửi</button><textarea>x</textarea><select></select></form>",
        "<meta http-equiv=\"refresh\" content=\"0;url=javascript:alert(1)\"><p>Chào</p>",
        "<base href=\"https://evil.example/\"><link rel=stylesheet href=\"https://evil.example/x.css\"><p>Chào</p>",
        "<body onload=alert(1)><p onclick=\"alert(1)\" onmouseover=alert(1)>Chào</p></body>",
        "<div style=\"color:red\" onfocus=alert(1) tabindex=0>Chào</div>",
        "<style>p{color:red}</style><script>alert(1)</script><p>Chào</p>",
        "<p>Chào<noscript><img src=x onerror=alert(1)></noscript></p>",
        "<template><img src=x onerror=alert(1)></template><p>Chào</p>",
        "<svg><style><a title=\"</style><img src=x onerror=alert(1)>\"></a></style></svg><p>Chào</p>",
        "<math><style><a title=\"</style><img src=x onerror=alert(1)>\"></a></style></math><p>Chào</p>",
        "<svg><style>&lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;</style></svg><p>Chào</p>" })
    void nothingThatRunsOrSendsComesOut(String attack) {
        Document clean = parse(MailHtml.clean(attack, cid -> Optional.empty()));

        assertThat(clean.select("script, iframe, frame, frameset, object, embed, form, input, button, textarea, select,"
                + " link, meta, base, svg, math, noscript, template")).isEmpty();
        assertThat(clean.getAllElements()).allSatisfy(element -> assertThat(element.attributes().asList())
                .noneMatch(attribute -> attribute.getKey().toLowerCase().startsWith("on")));
        assertThat(clean.select("[srcdoc], [formaction], [action], [http-equiv]")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = { "javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)",
        "&#106;avascript:alert(1)", "&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;&#x3A;alert(1)",
        "vbscript:msgbox(1)", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==", "ftp://files.example/x",
        "file:///etc/passwd", "//evil.example/x", "/api/accounts", "https:/api/accounts" })
    void aLinkKeepsOnlyAWebMailOrPhoneAddress(String href) {
        Document clean = parse(MailHtml.clean("<a href=\"" + href + "\">Bấm</a>", cid -> Optional.empty()));

        assertThat(clean.select("a")).singleElement().satisfies(link -> {
            assertThat(link.hasAttr("href")).isFalse();
            assertThat(link.text()).isEqualTo("Bấm");
        });
    }

    @ParameterizedTest
    @ValueSource(strings = { "https://shop.example/order/42", "http://shop.example/", "mailto:an@example.com",
        "tel:+84901234567" })
    void aWebMailOrPhoneLinkOpensApartFromSino(String href) {
        Document clean = parse(MailHtml.clean("<a href=\"" + href + "\" target=\"_self\">Bấm</a>",
                cid -> Optional.empty()));

        Element link = clean.selectFirst("a");
        assertThat(link.attr("href")).isEqualTo(href);
        assertThat(link.attr("target")).isEqualTo("_blank");
        assertThat(link.attr("rel")).isEqualTo("noopener noreferrer");
    }

    @ParameterizedTest
    @ValueSource(strings = { "javascript:alert(1)", "data:text/html,<script>alert(1)</script>",
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "/api/accounts", "//evil.example/p.gif", "ftp://files/x.png",
        "https:/api/conversations/x", "" })
    void anImageFromAnywhereElseIsLeftOut(String src) {
        Document clean = parse(MailHtml.clean("<p>Ảnh <img src=\"" + src + "\" alt=\"x\"></p>",
                cid -> Optional.empty()));

        assertThat(clean.select("img")).isEmpty();
        assertThat(clean.text()).isEqualTo("Ảnh");
    }

    @ParameterizedTest
    @ValueSource(strings = { "data:image/png;base64,iVBORw0KGgo=", "data:image/jpeg;base64,/9j/4AAQ=",
        "data:image/gif;base64,R0lGODlh", "data:image/webp;base64,UklGRg==", "DATA:IMAGE/PNG;base64,iVBORw0KGgo=" })
    void aPictureInsideTheMailStays(String src) {
        MailHtml.Clean clean = MailHtml.clean("<img src=\"" + src + "\" alt=\"Logo\">", cid -> Optional.empty());

        assertThat(parse(clean).selectFirst("img").attr("src")).isEqualTo(src);
        assertThat(clean.remoteImages()).isFalse();
    }

    @Test
    void anEmbeddedPictureGoesThroughSinoOrIsLeftOut() {
        MailHtml.Clean clean = MailHtml.clean("<img src=\"cid:logo@shop\" alt=\"Logo\"><img src=\"cid:missing\">",
                cid -> cid.equals("logo@shop")
                        ? Optional.of("/api/conversations/c/messages/m/attachments/a?inline=true") : Optional.empty());

        assertThat(parse(clean).select("img")).singleElement()
                .satisfies(image -> assertThat(image.attr("src"))
                        .isEqualTo("/api/conversations/c/messages/m/attachments/a?inline=true"));
        assertThat(clean.remoteImages()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = { "<img src=\"https://track.example.com/p.gif\" width=1 height=1>",
        "<img src=\"http://cdn.example.com/banner.png\">",
        "<table background=\"https://cdn.example.com/bg.png\"><tr><td>x</td></tr></table>",
        "<div style=\"background-image: url('https://cdn.example.com/bg.png')\">x</div>",
        "<div style=\"background:URL( https://cdn.example.com/bg.png )\">x</div>",
        "<style>.hero{background:url(//cdn.example.com/bg.png)}</style><div class=hero>x</div>",
        "<div style=\"background-image: image-set('https://cdn.example.com/bg.png' 1x)\">x</div>" })
    void aPictureFromTheWebIsReported(String html) {
        assertThat(MailHtml.clean(html, cid -> Optional.empty()).remoteImages()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = { "javascript:alert(1)", "/api/accounts", "https:/api/accounts",
        "//cdn.example.com/bg.png" })
    void aBackgroundFromAnywhereElseIsLeftOut(String background) {
        MailHtml.Clean clean = MailHtml.clean("<table background=\"" + background + "\"><tr><td background=\""
                + background + "\">x</td></tr></table>", cid -> Optional.empty());

        assertThat(parse(clean).select("[background]")).isEmpty();
        assertThat(clean.remoteImages()).isFalse();
    }

    @Test
    void stylesOfTheHeadKeepTheirOrderAndTheirScreenSizes() {
        Document document = parse(MailHtml.clean("<html><head><style>p { color: red }</style>"
                + "<style media=\"(max-width: 600px)\">p { color: blue }</style></head><body><p>Chào</p></body></html>",
                cid -> Optional.empty()));

        assertThat(document.select("style")).extracting(Element::data)
                .containsExactly("p { color: red }", "p { color: blue }");
        assertThat(document.select("style").get(1).attr("media")).isEqualTo("(max-width: 600px)");
    }

    @Test
    void mailWithoutPicturesFromTheWebSaysSo() {
        assertThat(MailHtml.clean("<p style=\"color:#333\">Chào <a href=\"https://shop.example\">bạn</a></p>",
                cid -> Optional.empty()).remoteImages()).isFalse();
    }

    @Test
    void aNewsletterKeepsItsLayout() {
        String newsletter = """
                <html><head><meta charset="utf-8"><title>Bản tin</title>
                <style type="text/css">.btn { background:#0a66c2; color:#fff; }</style></head>
                <body style="margin:0" onload="track()">
                <center><table width="600" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#ffffff">
                <tr><td valign="top" style="padding:24px;font-family:Arial">
                <h1 style="font-size:20px">Tuần này ở Sino</h1>
                <p><font color="#555555" face="Arial" size="2">Ba bài viết mới.</font></p>
                <a class="btn" href="https://sino.example/read?id=42" style="padding:8px 16px">Đọc ngay</a>
                <img src="https://sino.example/open.gif" width="1" height="1" alt="">
                </td></tr></table></center>
                </body></html>""";

        MailHtml.Clean clean = MailHtml.clean(newsletter, cid -> Optional.empty());
        Document document = parse(clean);

        assertThat(document.selectFirst("style").data()).contains(".btn { background:#0a66c2; color:#fff; }");
        assertThat(document.selectFirst("table").attributes().asList()).extracting(attribute -> attribute.getKey())
                .contains("width", "cellpadding", "cellspacing", "border", "align", "bgcolor");
        assertThat(document.selectFirst("td").attr("style")).isEqualTo("padding:24px;font-family:Arial");
        assertThat(document.selectFirst("font").attr("color")).isEqualTo("#555555");
        assertThat(document.select("center, h1")).hasSize(2);
        assertThat(document.selectFirst("a").attr("class")).isEqualTo("btn");
        assertThat(document.select("title, meta")).isEmpty();
        assertThat(clean.html()).doesNotContain("track()");
        assertThat(clean.remoteImages()).isTrue();
    }

    @Test
    void aGmailReplyKeepsTheQuotedMail() {
        String reply = """
                <div dir="ltr">Cảm ơn chị.</div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">
                Vào Th 2, 6 thg 10, 2026 lúc 08:00 An &lt;<a href="mailto:an@example.com">an@example.com</a>&gt;
                đã viết:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid
                rgb(204,204,204);padding-left:1ex">Gửi bạn báo giá.</blockquote></div>""";

        Document document = parse(MailHtml.clean(reply, cid -> Optional.empty()));

        assertThat(document.select("div.gmail_quote blockquote.gmail_quote")).hasSize(1);
        assertThat(document.selectFirst("blockquote").attr("style")).startsWith("margin:0px 0px 0px 0.8ex");
        assertThat(document.selectFirst("div").attr("dir")).isEqualTo("ltr");
        assertThat(document.selectFirst("a").attr("href")).isEqualTo("mailto:an@example.com");
    }

    @Test
    void textOutsideTheTagsIsKeptAsText() {
        Document document = parse(MailHtml.clean("<p>1 &lt; 2 &amp; 3 &gt; 2</p>", cid -> Optional.empty()));

        assertThat(document.selectFirst("p").text()).isEqualTo("1 < 2 & 3 > 2");
        assertThat(MailHtml.clean("", cid -> Optional.empty())).isEqualTo(NOTHING);
    }

    private static Document parse(MailHtml.Clean clean) {
        return Jsoup.parseBodyFragment(clean.html());
    }

}
