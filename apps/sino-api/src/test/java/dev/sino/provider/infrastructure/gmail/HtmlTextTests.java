package dev.sino.provider.infrastructure.gmail;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class HtmlTextTests {

    @Test
    void leavesOutTheHeadScriptsAndStyles() {
        String html = "<html><head><title>Bản tin</title><style>p { color: red; }</style></head>"
                + "<body><p>Xin chào</p><script>track(\"open\")</script></body></html>";

        assertThat(HtmlText.of(html)).isEqualTo("Xin chào");
    }

    @Test
    void decodesEntities() {
        assertThat(HtmlText.of("<p>Ch&agrave;o b&#7841;n &amp; c&#7843; nh&oacute;m</p>"))
                .isEqualTo("Chào bạn & cả nhóm");
    }

    @Test
    void breaksTheLineAfterABlockAndAtABr() {
        assertThat(HtmlText.of("<p>One</p><div>Two<br>Three</div><ul><li>Four</li><li>Five</li></ul>"))
                .isEqualTo("One\nTwo\nThree\nFour\nFive");
    }

    @Test
    void keepsInlineTextOnOneLineWithSingleSpaces() {
        assertThat(HtmlText.of("<p>Hello   <b>big</b>\n   <i>world</i></p>")).isEqualTo("Hello big world");
    }

    @Test
    void turnsNonBreakingAndRepeatedSpacesIntoOne() {
        assertThat(HtmlText.of("<p>Hello <b> big</b>&nbsp;&nbsp;world</p>")).isEqualTo("Hello big world");
    }

    @Test
    void keepsTheLineBreaksOfPreformattedText() {
        assertThat(HtmlText.of("<p>Log:</p><pre>line 1\nline 2</pre><p>after\nthe log</p>"))
                .isEqualTo("Log:\nline 1\nline 2\nafter the log");
    }

    @Test
    void dropsTheInvisiblePaddingOfAPreheader() {
        assertThat(HtmlText.of("<p>&zwnj;&#847;&#8203;&#65279;&zwnj;Hello</p>")).isEqualTo("Hello");
    }

    @Test
    void keepsTheJoinerOfAnEmojiSequence() {
        assertThat(HtmlText.of("<p>\uD83D\uDC68&zwj;\uD83D\uDC69</p>")).isEqualTo("\uD83D\uDC68\u200D\uD83D\uDC69");
    }

    @Test
    void keepsAtMostOneEmptyLine() {
        assertThat(HtmlText.of("<p>a</p><p></p><p></p><p></p><div>   </div><p>b</p>")).isEqualTo("a\n\nb");
    }

    @Test
    void readsAFragmentWithoutHtmlOrBody() {
        assertThat(HtmlText.of("Just <i>text</i>")).isEqualTo("Just text");
    }

    @Test
    void anEmptyPageHasNoText() {
        assertThat(HtmlText.of("<html><body>  </body></html>")).isEmpty();
    }

}
