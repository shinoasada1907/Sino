-- D-75 (BE-47): where others reach the account, such as the email address of a Gmail account. Optional: a provider
-- may have none, and an account connected before this column stays NULL until it is connected again (no guess
-- from display_name, which the user may have renamed).
ALTER TABLE connected_account
    ADD COLUMN address text;
