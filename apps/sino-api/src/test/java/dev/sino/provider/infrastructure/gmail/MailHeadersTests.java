package dev.sino.provider.infrastructure.gmail;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.provider.infrastructure.gmail.MailHeaders.Mailbox;

class MailHeadersTests {

    @Test
    void decodesAnEncodedWordInBase64() {
        assertThat(MailHeaders.decode("=?UTF-8?B?Tmd1eeG7hW4gVsSDbiBBbg==?=")).isEqualTo("Nguyễn Văn An");
    }

    @Test
    void decodesAQuotedPrintableWordWithUnderscoresAsSpaces() {
        assertThat(MailHeaders.decode("=?utf-8?q?B=C3=A1o_c=C3=A1o?=")).isEqualTo("Báo cáo");
    }

    @Test
    void keepsTheTextAroundEncodedWords() {
        assertThat(MailHeaders.decode("Re: =?UTF-8?Q?B=C3=A1o?= tháng 9")).isEqualTo("Re: Báo tháng 9");
    }

    @Test
    void dropsTheSpaceBetweenTwoEncodedWords() {
        assertThat(MailHeaders.decode("=?UTF-8?Q?Ch=C3=A0o?= \r\n =?UTF-8?Q?_b=E1=BA=A1n?=")).isEqualTo("Chào bạn");
    }

    @Test
    void dropsTheSpaceBetweenTwoEncodedWordsInDifferentCharsets() {
        assertThat(MailHeaders.decode("=?UTF-8?Q?Ch=C3=A0o?= =?ISO-8859-1?Q?_caf=E9?=")).isEqualTo("Chào café");
    }

    @Test
    void joinsACharacterSplitAcrossTwoEncodedWords() {
        // "ạ" is E1 BA A1 in UTF-8: the first word ends with E1, the second starts with BA A1.
        assertThat(MailHeaders.decode("=?UTF-8?B?Q2jh?= =?UTF-8?B?uqE=?=")).isEqualTo("Chạ");
    }

    @Test
    void decodesOtherCharsets() {
        assertThat(MailHeaders.decode("=?ISO-8859-1?Q?caf=E9?=")).isEqualTo("café");
    }

    @Test
    void ignoresTheLanguageOfACharset() {
        assertThat(MailHeaders.decode("=?UTF-8*vi?Q?Ch=C3=A0o?=")).isEqualTo("Chào");
    }

    @Test
    void keepsTheSpaceBetweenAnEncodedWordAndPlainText() {
        assertThat(MailHeaders.decode("=?UTF-8?Q?Ch=C3=A0o?= team")).isEqualTo("Chào team");
    }

    @ParameterizedTest
    @ValueSource(strings = { "=?x-made-up?Q?abc?=", "=?UTF-8?B?***?=", "=?UTF-8?Q?=ZZ?=", "Hello", "" })
    void leavesAnythingItCannotDecodeAsItIs(String value) {
        assertThat(MailHeaders.decode(value)).isEqualTo(value);
    }

    @Test
    void nothingStaysNothing() {
        assertThat(MailHeaders.decode(null)).isNull();
        assertThat(MailHeaders.mailboxes(null)).isEmpty();
    }

    @Test
    void readsNamesAndAddressesInOrder() {
        assertThat(MailHeaders.mailboxes("\"Trần, Bình\" <Binh@Example.com>, chi@example.com"))
                .containsExactly(new Mailbox("binh@example.com", "Trần, Bình"),
                        new Mailbox("chi@example.com", null));
    }

    @Test
    void decodesAnEncodedName() {
        assertThat(MailHeaders.mailboxes("=?UTF-8?B?Tmd1eeG7hW4gVsSDbiBBbg==?= <An.Nguyen@Example.com>"))
                .containsExactly(new Mailbox("an.nguyen@example.com", "Nguyễn Văn An"));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "Sino News <news@example.com>          | Sino News",
        "\"Anh \\\"Ba\\\"\" <news@example.com> | Anh \"Ba\"",
        "<news@example.com>                    | ",
        "news@example.com (Old style comment)  | " })
    void readsTheDisplayName(String header, String name) {
        assertThat(MailHeaders.mailboxes(header)).containsExactly(new Mailbox("news@example.com", name));
    }

    @Test
    void anEscapedQuoteDoesNotEndTheName() {
        assertThat(MailHeaders.mailboxes("\"Anh \\\"Ba, Bốn\\\"\" <ba@example.com>, chi@example.com"))
                .containsExactly(new Mailbox("ba@example.com", "Anh \"Ba, Bốn\""),
                        new Mailbox("chi@example.com", null));
    }

    @Test
    void aCommentThatNeverEndsIsNotAComment() {
        assertThat(MailHeaders.mailboxes("Bob :-( <bob@example.com>"))
                .containsExactly(new Mailbox("bob@example.com", "Bob :-("));
    }

    @Test
    void readsTheMembersOfAGroup() {
        assertThat(MailHeaders.mailboxes("Team: a@example.com, B <b@example.com>;, c@example.com"))
                .extracting(Mailbox::email).containsExactly("a@example.com", "b@example.com", "c@example.com");
    }

    @ParameterizedTest
    @ValueSource(strings = { "undisclosed-recipients:;", "not an address", "<>", "\"Only a name\"", " , ,",
        "Some name some@example.com", "a@b@example.com", "@example.com", "someone@" })
    void skipsEntriesWithoutAnAddress(String header) {
        assertThat(MailHeaders.mailboxes(header)).isEmpty();
    }

}
