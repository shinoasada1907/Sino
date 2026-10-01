/**
 * Technical concerns shared by all modules (security, web, error model).
 * Holds no business logic and depends on no business module.
 */
@ApplicationModule(allowedDependencies = {})
package dev.sino.common;

import org.springframework.modulith.ApplicationModule;
