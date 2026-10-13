package dev.sino.provider.infrastructure.gmail;

import java.util.regex.Pattern;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.select.NodeVisitor;

/**
 * The readable text of an HTML body (D-61): what a person sees, without scripts, styles or the head, entities
 * decoded, one line per block and per {@code <br>}. No HTML is kept (F06 shows HTML).
 */
final class HtmlText {

    // Padding of marketing preheaders. Not U+200D, which joins the parts of an emoji such as a family.
    private static final Pattern INVISIBLE = Pattern.compile("[\\u00AD\\u034F\\u200B\\u200C\\uFEFF]");
    private static final Pattern SPACES = Pattern.compile("[ \\t\\x0B\\f\\u00A0]+");
    private static final Pattern SPACES_AROUND_BREAKS = Pattern.compile(" *\\n *");
    private static final Pattern BLANK_LINES = Pattern.compile("\\n{3,}");

    private HtmlText() {
    }

    static String of(String html) {
        Document page = Jsoup.parse(html);
        page.select("head, script, style, template").remove();
        StringBuilder text = new StringBuilder();
        new NodeVisitor() {

            // Inside <pre> the line breaks of the source are the text's own.
            private int preformatted;

            @Override
            public void head(Node node, int depth) {
                if (node instanceof TextNode words) {
                    text.append(preformatted > 0 ? words.getWholeText() : words.text());
                } else if (node.nameIs("br")) {
                    text.append('\n');
                } else if (node.nameIs("pre")) {
                    preformatted++;
                }
            }

            @Override
            public void tail(Node node, int depth) {
                if (node.nameIs("pre")) {
                    preformatted--;
                }
                if (node instanceof Element element && element.isBlock()) {
                    text.append('\n');
                }
            }

        }.traverse(page.body());
        String visible = INVISIBLE.matcher(text).replaceAll("");
        String lines = SPACES_AROUND_BREAKS.matcher(SPACES.matcher(visible).replaceAll(" ")).replaceAll("\n");
        return BLANK_LINES.matcher(lines).replaceAll("\n\n").strip();
    }

}
