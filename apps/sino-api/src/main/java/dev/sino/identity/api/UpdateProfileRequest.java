package dev.sino.identity.api;

import java.util.LinkedHashSet;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonAnySetter;

import dev.sino.identity.application.ProfileChange;

/**
 * Body of {@code PATCH /api/profile}: any of the five editable fields. A missing or {@code null} field stays as it is;
 * an empty one clears an optional field. It is a class, not a record, because it must see the fields it does not
 * know: the application ignores unknown JSON fields everywhere, but a profile change that names {@code email} or
 * {@code role} has to be refused, not half done. {@link ProfileRules} refuses them, and checks each value.
 */
@ValidProfileChange
final class UpdateProfileRequest {

    private String displayName;
    private String phoneNumber;
    private String jobTitle;
    private String location;
    private String bio;
    private final Set<String> unknownFields = new LinkedHashSet<>();

    String displayName() {
        return displayName;
    }

    void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    String phoneNumber() {
        return phoneNumber;
    }

    void setPhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }

    String jobTitle() {
        return jobTitle;
    }

    void setJobTitle(String jobTitle) {
        this.jobTitle = jobTitle;
    }

    String location() {
        return location;
    }

    void setLocation(String location) {
        this.location = location;
    }

    String bio() {
        return bio;
    }

    void setBio(String bio) {
        this.bio = bio;
    }

    Set<String> unknownFields() {
        return unknownFields;
    }

    @JsonAnySetter
    void unknownField(String name, Object value) {
        unknownFields.add(name);
    }

    ProfileChange toChange() {
        return new ProfileChange(displayName, phoneNumber, jobTitle, location, bio);
    }

}
