/**
 * Error model shared by all modules (D-21): modules report failures with {@link dev.sino.common.error.SinoException}
 * and their own {@link dev.sino.common.error.ErrorCode} enums; the web layer turns them into RFC 9457 responses.
 */
@NamedInterface("error")
package dev.sino.common.error;

import org.springframework.modulith.NamedInterface;
