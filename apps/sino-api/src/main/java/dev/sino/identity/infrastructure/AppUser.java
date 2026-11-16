package dev.sino.identity.infrastructure;

import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import org.hibernate.annotations.UuidGenerator;

/**
 * A Sino user, table {@code app_user}. Not a provider account: those are connected accounts.
 */
@Entity
@Table(name = "app_user")
public class AppUser {

    public static final int MAX_DISPLAY_NAME_LENGTH = 200;
    public static final int MAX_PHONE_NUMBER_LENGTH = 30;
    public static final int MAX_JOB_TITLE_LENGTH = 100;
    public static final int MAX_LOCATION_LENGTH = 100;
    public static final int MAX_BIO_LENGTH = 500;

    private static final Pattern PHONE_NUMBER = Pattern.compile("[-0-9 +().]+");

    @Id
    @UuidGenerator(style = UuidGenerator.Style.VERSION_7)
    private UUID id;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "phone_number")
    private String phoneNumber;

    @Column(name = "job_title")
    private String jobTitle;

    @Column(name = "location")
    private String location;

    @Column(name = "bio")
    private String bio;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private UserStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** For JPA. */
    protected AppUser() {
    }

    public AppUser(String email, String displayName) {
        this.email = email;
        this.displayName = displayName;
        this.status = UserStatus.ACTIVE;
    }

    public UUID id() {
        return id;
    }

    public String email() {
        return email;
    }

    public String displayName() {
        return displayName;
    }

    public String phoneNumber() {
        return phoneNumber;
    }

    public String jobTitle() {
        return jobTitle;
    }

    public String location() {
        return location;
    }

    public String bio() {
        return bio;
    }

    public UserStatus status() {
        return status;
    }

    public Instant createdAt() {
        return createdAt;
    }

    /**
     * Sets the five profile fields as given; a caller that changes only some passes the others back. Every value is
     * trimmed, and an optional one that is empty after that becomes {@code null}. Nothing changes when it throws.
     *
     * @throws IllegalArgumentException when the display name is empty, a value is too long or holds a NUL, or the
     *                                  phone number has a character other than digits, spaces and {@code + ( ) - .}
     */
    public void updateProfile(String displayName, String phoneNumber, String jobTitle, String location, String bio) {
        String newName = checked(displayName, MAX_DISPLAY_NAME_LENGTH, "displayName");
        if (newName == null) {
            throw new IllegalArgumentException("displayName must not be empty");
        }
        String newPhone = checked(phoneNumber, MAX_PHONE_NUMBER_LENGTH, "phoneNumber");
        if (newPhone != null && !PHONE_NUMBER.matcher(newPhone).matches()) {
            throw new IllegalArgumentException("phoneNumber has only digits, spaces and + ( ) - .");
        }
        String newJobTitle = checked(jobTitle, MAX_JOB_TITLE_LENGTH, "jobTitle");
        String newLocation = checked(location, MAX_LOCATION_LENGTH, "location");
        String newBio = checked(bio, MAX_BIO_LENGTH, "bio");
        this.displayName = newName;
        this.phoneNumber = newPhone;
        this.jobTitle = newJobTitle;
        this.location = newLocation;
        this.bio = newBio;
    }

    /** {@code value} trimmed, or {@code null} when nothing is left; the length counts code points, like the database. */
    private static String checked(String value, int maxLength, String field) {
        if (value == null) {
            return null;
        }
        if (value.indexOf('\0') >= 0) {
            throw new IllegalArgumentException(field + " must not hold a NUL character");
        }
        String trimmed = stripped(value);
        if (trimmed.codePointCount(0, trimmed.length()) > maxLength) {
            throw new IllegalArgumentException(field + " has at most " + maxLength + " characters");
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** Removes what a browser's {@code trim} removes (no-break space, ideographic space, byte order mark) at both ends. */
    private static String stripped(String text) {
        int start = 0;
        int end = text.length();
        while (start < end && isSpace(text.codePointAt(start))) {
            start += Character.charCount(text.codePointAt(start));
        }
        while (end > start && isSpace(text.codePointBefore(end))) {
            end -= Character.charCount(text.codePointBefore(end));
        }
        return text.substring(start, end);
    }

    private static boolean isSpace(int codePoint) {
        return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint) || codePoint == '﻿';
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

}
