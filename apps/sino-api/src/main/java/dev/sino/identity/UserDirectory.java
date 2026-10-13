package dev.sino.identity;

import java.util.List;

/**
 * How another module reads the Sino users, for the work of the person who runs Sino (admin, D-265): who they are,
 * never a password. Read only; the tables of this module stay its own.
 */
public interface UserDirectory {

    /** Every Sino user, whatever their status, oldest first. */
    List<UserSummary> allUsers();

}
