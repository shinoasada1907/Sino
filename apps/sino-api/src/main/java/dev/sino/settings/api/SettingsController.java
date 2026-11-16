package dev.sino.settings.api;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.identity.CurrentUser;
import dev.sino.settings.application.SettingsService;
import dev.sino.settings.application.StoredDataService;

/** The settings of the signed-in user (spec {@code user-settings}, D-401, D-402). */
@RestController
@RequestMapping("/api/settings")
class SettingsController {

    private final SettingsService settings;
    private final StoredDataService storedData;
    private final CurrentUser currentUser;

    SettingsController(SettingsService settings, StoredDataService storedData, CurrentUser currentUser) {
        this.settings = settings;
        this.storedData = storedData;
        this.currentUser = currentUser;
    }

    /** The defaults while the user has changed nothing; reading never writes. */
    @GetMapping
    SettingsResponse read() {
        return SettingsResponse.from(settings.read(currentUser.requireOwnerId()));
    }

    /** Changes what the body names and answers with the whole settings; {@code {}} changes nothing. */
    @PatchMapping
    SettingsResponse change(@Valid @RequestBody SettingsPatch patch) {
        return SettingsResponse.from(settings.change(currentUser.requireOwnerId(), patch.toChange()));
    }

    /** How many messages Sino keeps for the user and about how many bytes they and the stickers take (D-403). */
    @GetMapping("/storage")
    StorageResponse storage() {
        return StorageResponse.from(storedData.of(currentUser.requireOwnerId()));
    }

}
