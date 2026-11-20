package dev.sino.provider.infrastructure.zalo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Location;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedMessage;
import tools.jackson.databind.json.JsonMapper;

/**
 * A location Zalo message becomes a {@code TEXT} {@code [Vị trí] ...} with the place in {@code metadata}, and sino-zalo's
 * numbers are checked again here (zalo-location-card, ZC-03, D-530); the log never carries a value (D-532).
 */
@ExtendWith(OutputCaptureExtension.class)
class ZaloLocationTests {

    private static final String SELF = "100000000000000001";
    private static final String FRIEND = "200000000000000002";
    private static final String SENT_AT = "2026-11-20T08:30:00Z";
    private static final String MAP = "https://maps-zpc.zdn.vn/a/b.png";

    private static Message location(Location location) {
        return new Message("1001", FRIEND, "USER", FRIEND, "Bình", false, "chat.location.new", null, SENT_AT, null,
                null, null, null, null, null, null, null, null, location);
    }

    private static NormalizedMessage normalize(Location location) {
        return ZaloMessageNormalizer.normalize(location(location), SELF);
    }

    @Test
    void aLocationWithAllItsFieldsIsATextNamedByItsTitleWithThePlaceInMetadata() {
        NormalizedMessage message = normalize(
                new Location(10.7769, 106.70098, "Heyman Coffee", "12 Nguyễn Huệ, Quận 1", MAP, false));

        assertThat(message.type()).isEqualTo(MessageType.TEXT);
        assertThat(message.textContent()).isEqualTo("[Vị trí] Heyman Coffee");
        assertThat(message.metadata()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "zaloType", "chat.location.new",
                NormalizedMessage.LOCATION_LAT, "10.7769",
                NormalizedMessage.LOCATION_LNG, "106.70098",
                NormalizedMessage.LOCATION_TITLE, "Heyman Coffee",
                NormalizedMessage.LOCATION_ADDRESS, "12 Nguyễn Huệ, Quận 1",
                NormalizedMessage.LOCATION_PREVIEW_URL, MAP,
                NormalizedMessage.LOCATION_CURRENT, "false"));
    }

    @Test
    void withoutATitleTheAddressNamesItAndSpacesAndLineBreaksCollapseInTheTextOnly() {
        NormalizedMessage message = normalize(new Location(21.0285, 105.8542, null, " Hồ Hoàn Kiếm,\n Hà   Nội ", null,
                true));

        assertThat(message.textContent()).isEqualTo("[Vị trí] Hồ Hoàn Kiếm, Hà Nội");
        assertThat(message.metadata()).containsEntry(NormalizedMessage.LOCATION_ADDRESS, "Hồ Hoàn Kiếm,\n Hà   Nội")
                .containsEntry(NormalizedMessage.LOCATION_CURRENT, "true")
                .doesNotContainKeys(NormalizedMessage.LOCATION_TITLE, NormalizedMessage.LOCATION_PREVIEW_URL);
    }

    @Test
    void withNeitherTitleNorAddressTheTextIsJustTheLabel() {
        NormalizedMessage message = normalize(new Location(-33.8688, 151.2093, " ", null, null, null));

        assertThat(message.textContent()).isEqualTo("[Vị trí]");
        assertThat(message.metadata()).containsEntry(NormalizedMessage.LOCATION_LAT, "-33.8688")
                .containsEntry(NormalizedMessage.LOCATION_CURRENT, "false");
    }

    @ParameterizedTest
    @CsvSource({"90,180", "-90,-180", "0,0", "0.0000001,-0.0000001"})
    void coordinatesOnTheBoundariesAreKeptAndWrittenAsPlainDecimals(double lat, double lng) {
        NormalizedMessage message = normalize(new Location(lat, lng, null, null, null, false));

        assertThat(message.type()).isEqualTo(MessageType.TEXT);
        assertThat(message.metadata().get(NormalizedMessage.LOCATION_LAT)).doesNotContain("E");
        assertThat(Double.parseDouble(message.metadata().get(NormalizedMessage.LOCATION_LAT))).isEqualTo(lat);
        assertThat(Double.parseDouble(message.metadata().get(NormalizedMessage.LOCATION_LNG))).isEqualTo(lng);
    }

    @Test
    void coordinatesThatAreMissingOutOfRangeOrNotFiniteLeaveTheUnsupportedPlaceholder(CapturedOutput output) {
        Location[] refused = {
                new Location(null, 106.7, "A", "B", null, false),
                new Location(10.7, null, "A", "B", null, false),
                new Location(90.0001, 106.7, "A", "B", null, false),
                new Location(-90.0001, 106.7, "A", "B", null, false),
                new Location(10.7, 180.0001, "A", "B", null, false),
                new Location(10.7, -180.0001, "A", "B", null, false),
                new Location(Double.NaN, 106.7, "A", "B", null, false),
                new Location(10.7, Double.POSITIVE_INFINITY, "A", "B", null, false)};

        for (Location bad : refused) {
            NormalizedMessage message = normalize(bad);

            assertThat(message.type()).isEqualTo(MessageType.UNKNOWN);
            assertThat(message.textContent()).isEqualTo("[Tin Zalo chưa hỗ trợ]");
            assertThat(message.metadata()).containsExactlyEntriesOf(Map.of("zaloType", "chat.location.new"));
        }
        assertThat(output.getAll()).contains("coordinates Sino does not accept");
    }

    @Test
    void aLocationTypeWithoutALocationStaysTheUnsupportedPlaceholderAsBefore(CapturedOutput output) {
        NormalizedMessage message = normalize(null);

        assertThat(message.type()).isEqualTo(MessageType.UNKNOWN);
        assertThat(message.textContent()).isEqualTo("[Tin Zalo chưa hỗ trợ]");
        assertThat(message.metadata()).containsEntry("zaloType", "chat.location.new")
                .doesNotContainKey(NormalizedMessage.LOCATION_LAT);
        assertThat(output.getAll()).doesNotContain("coordinates");
    }

    @Test
    void aMapPictureOutsideZaloDomainsIsDroppedAndWarnedAboutByHostAlone(CapturedOutput output) {
        NormalizedMessage message = normalize(new Location(10.7, 106.7, "A", null,
                "https://evil.example.com/private/token-abc123/map.png", false));

        assertThat(message.metadata()).doesNotContainKey(NormalizedMessage.LOCATION_PREVIEW_URL);
        assertThat(message.type()).isEqualTo(MessageType.TEXT);
        assertThat(output.getAll()).contains("evil.example.com").doesNotContain("token-abc123");
    }

    @Test
    void titleAndAddressAreCutToTheirLimits() {
        NormalizedMessage message = normalize(new Location(10.7, 106.7, "t".repeat(250), "a".repeat(400), null, false));

        assertThat(message.metadata().get(NormalizedMessage.LOCATION_TITLE)).hasSize(200);
        assertThat(message.metadata().get(NormalizedMessage.LOCATION_ADDRESS)).hasSize(300);
    }

    @Test
    void theLogCarriesNeitherCoordinatesNorTitleNorAddress(CapturedOutput output) {
        normalize(new Location(95.123456, 106.7, "Quán Bí Mật", "Số 7 Ngõ Kín", "https://evil.example.com/x.png",
                false));
        normalize(new Location(10.7, 106.7, "Quán Bí Mật", "Số 7 Ngõ Kín", "https://evil.example.com/x.png", true));

        assertThat(output.getAll()).doesNotContain("95.123456").doesNotContain("106.7").doesNotContain("Quán Bí Mật")
                .doesNotContain("Số 7 Ngõ Kín");
    }

    @Test
    void aLocationMessageKeepsItsRawContentSoItCanStillBeQuoted() {
        Message raw = new Message("1001", FRIEND, "USER", FRIEND, "Bình", false, "chat.location.new", null, SENT_AT,
                null, null, null, "123456", 0, null,
                JsonMapper.builder().build().readTree("{\"params\":\"{}\"}"), null, null,
                new Location(10.7, 106.7, "A", null, null, false));

        NormalizedMessage message = ZaloMessageNormalizer.normalize(raw, SELF);

        assertThat(message.metadata()).containsKey(NormalizedMessage.RAW_CONTENT)
                .containsEntry(NormalizedMessage.MSG_TYPE, "chat.location.new");
    }

    @Test
    void theLocationOfAMessageIsReadFromJsonAndAMessageWithoutOneHasNone() {
        String json = """
                {"msgId":"1","threadId":"t","threadType":"USER","fromId":"f","fromName":"B","isSelf":false,
                 "zaloType":"chat.location.new","text":null,"sentAt":"2026-11-20T08:30:00Z",
                 "location":{"latitude":10.7769,"longitude":106.70098,"title":null,"address":"Quận 1",
                             "previewUrl":null,"current":true,"extra":1}}""";
        String older = """
                {"msgId":"1","threadId":"t","threadType":"USER","fromId":"f","fromName":"B","isSelf":false,
                 "zaloType":"webchat","text":"hi","sentAt":"2026-11-20T08:30:00Z"}""";
        JsonMapper mapper = JsonMapper.builder().build();

        assertThat(mapper.readValue(json, Message.class).location())
                .isEqualTo(new Location(10.7769, 106.70098, null, "Quận 1", null, true));
        assertThat(mapper.readValue(older, Message.class).location()).isNull();
    }

}
