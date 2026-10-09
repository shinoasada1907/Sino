package dev.sino.sync.api;

import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.identity.CurrentUser;
import dev.sino.sync.application.InitialSyncService;
import dev.sino.sync.application.InitialSyncService.InitialSyncStatus;
import dev.sino.sync.application.InitialSyncService.SyncEstimate;
import dev.sino.sync.application.SyncRange;

/**
 * Step "Đồng bộ" of connecting an account and its progress on the Accounts screen (F05, D-64). A range other than
 * {@code DAYS_30}, {@code DAYS_90} or {@code ALL} is a 400; an account that is not the caller's, or removed, a 404.
 */
@RestController
@RequestMapping("/api/accounts/{id}/initial-sync")
class InitialSyncController {

    private final InitialSyncService initialSync;
    private final CurrentUser currentUser;

    InitialSyncController(InitialSyncService initialSync, CurrentUser currentUser) {
        this.initialSync = initialSync;
        this.currentUser = currentUser;
    }

    @GetMapping("/estimate")
    SyncEstimate estimate(@PathVariable UUID id, @RequestParam SyncRange range) {
        return initialSync.estimate(currentUser.requireOwnerId(), id, range);
    }

    /** 202: the import runs in the background; the body is its status, also when it was already running. */
    @PostMapping
    ResponseEntity<InitialSyncStatus> start(@PathVariable UUID id, @Valid @RequestBody StartRequest request) {
        return ResponseEntity.accepted().body(initialSync.start(currentUser.requireOwnerId(), id, request.range()));
    }

    @GetMapping
    InitialSyncStatus status(@PathVariable UUID id) {
        return initialSync.status(currentUser.requireOwnerId(), id);
    }

    record StartRequest(@NotNull SyncRange range) {
    }

}
