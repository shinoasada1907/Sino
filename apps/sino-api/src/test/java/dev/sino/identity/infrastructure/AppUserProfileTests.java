package dev.sino.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class AppUserProfileTests {

    private final AppUser user = new AppUser("me@sino.test", "Old Name");

    @Test
    void valuesAreTrimmedAndStored() {
        user.updateProfile("  New Name ", " +84 (912) 345-678 ", " Engineer ", " Hà Nội ", " Line 1\nLine 2 ");

        assertThat(user.displayName()).isEqualTo("New Name");
        assertThat(user.phoneNumber()).isEqualTo("+84 (912) 345-678");
        assertThat(user.jobTitle()).isEqualTo("Engineer");
        assertThat(user.location()).isEqualTo("Hà Nội");
        assertThat(user.bio()).isEqualTo("Line 1\nLine 2");
    }

    @Test
    void anEmptyOptionalFieldBecomesNull() {
        user.updateProfile("Name", "1", "x", "y", "z");

        user.updateProfile("Name", "   ", "", " 　", null);

        assertThat(user.phoneNumber()).isNull();
        assertThat(user.jobTitle()).isNull();
        assertThat(user.location()).isNull();
        assertThat(user.bio()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", " "})
    void anEmptyDisplayNameIsRefusedAndNothingChanges(String name) {
        assertThatThrownBy(() -> user.updateProfile(name, "1", null, null, null))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("displayName");

        assertThat(user.displayName()).isEqualTo("Old Name");
        assertThat(user.phoneNumber()).isNull();
    }

    @Test
    void aNullDisplayNameIsRefused() {
        assertThatThrownBy(() -> user.updateProfile(null, null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void lengthLimitsAreInclusive() {
        user.updateProfile("a".repeat(200), "1".repeat(30), "b".repeat(100), "c".repeat(100), "d".repeat(500));

        assertThat(user.displayName()).hasSize(200);
        assertThat(user.bio()).hasSize(500);
    }

    @Test
    void lengthCountsCodePointsNotUtf16Units() {
        String emoji = "😀";

        user.updateProfile("Name", null, null, emoji.repeat(100), emoji.repeat(500));

        assertThat(user.location()).isEqualTo(emoji.repeat(100));
        assertThat(user.bio()).isEqualTo(emoji.repeat(500));
    }

    @Test
    void oneCharacterOverALimitIsRefused() {
        assertThatThrownBy(() -> user.updateProfile("a".repeat(201), null, null, null, null))
                .hasMessageContaining("displayName");
        assertThatThrownBy(() -> user.updateProfile("N", "1".repeat(31), null, null, null))
                .hasMessageContaining("phoneNumber");
        assertThatThrownBy(() -> user.updateProfile("N", null, "b".repeat(101), null, null))
                .hasMessageContaining("jobTitle");
        assertThatThrownBy(() -> user.updateProfile("N", null, null, "c".repeat(101), null))
                .hasMessageContaining("location");
        assertThatThrownBy(() -> user.updateProfile("N", null, null, null, "d".repeat(501)))
                .hasMessageContaining("bio");
    }

    @Test
    void aNulCharacterIsRefusedInEveryField() {
        assertThatThrownBy(() -> user.updateProfile("a\0b", null, null, null, null))
                .hasMessageContaining("NUL");
        assertThatThrownBy(() -> user.updateProfile("N", null, "a\0", null, null)).hasMessageContaining("NUL");
        assertThatThrownBy(() -> user.updateProfile("N", null, null, "\0", null)).hasMessageContaining("NUL");
        assertThatThrownBy(() -> user.updateProfile("N", null, null, null, "x\0y")).hasMessageContaining("NUL");
    }

    @ParameterizedTest
    @ValueSource(strings = {"call me", "0912a", "0912#", "0912\n345", "0912/345", "+84_912"})
    void aPhoneNumberWithOtherCharactersIsRefused(String phone) {
        assertThatThrownBy(() -> user.updateProfile("N", phone, null, null, null))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("phoneNumber");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0912345678", "+84 912 345 678", "(028) 3822-1234", "028.3822.1234"})
    void aPhoneNumberWithDigitsSpacesAndPunctuationIsAccepted(String phone) {
        user.updateProfile("N", phone, null, null, null);

        assertThat(user.phoneNumber()).isEqualTo(phone);
    }

}
