/**
 * control.ts - Centralized configuration constants for WhirlZoomMap
 *
 * This file contains all tunable parameters organized by functional area.
 * It has NO imports from other project files to avoid circular dependencies.
 */

// ============================================================================
// TOUCH_INTERACTION - Double-tap prevention and gesture timing
// ============================================================================

export const DOUBLE_TAP_THRESHOLD_MS = 300;                  // Max interval between taps to count as double-tap

// ============================================================================
// ROTATION - Gear/edge mode, rotation speed, thresholds
// ============================================================================

export type RotationMode = 'edge' | 'gear';
export const ROTATION_MODE: RotationMode = 'gear';           // 'edge' = auto-rotation near edges, 'gear' = vertical drag rotation

export const ROTATION_EDGE_THRESHOLD_RATIO = 10.0;           // Gear appears within (rect.width / this) from edge
export const ROTATION_SPEED_DEG_PER_SEC = 90;                // Rotation speed at full progress (edge mode)
export const ROTATION_MAX_DT = 0.1;                          // Clamp dt to prevent huge jumps (in seconds)

// ============================================================================
// EDGE_INDICATOR - Edge bar appearance thresholds
// ============================================================================

export const EDGE_BAR_GAP_PX = 8;                            // Gap between top and bottom edge bars
export const EDGE_BAR_WIDTH_DIVISOR = 64;                    // Bar width = max(2, rect.width / this)
export const EDGE_BAR_Z_INDEX = 1000;                        // z-index for edge bars
export const EDGE_BAR_OPACITY = 0.8;                         // Bar opacity
export const EDGE_BAR_COLOR_RED = '#ff4444';                 // Red bar color
export const EDGE_BAR_COLOR_BLUE = '#4444ff';                // Blue bar color

export const EDGE_START_THRESHOLD_RATIO = 8;                 // Bars start sliding in at (rect.width / this) from edge
export const EDGE_END_THRESHOLD_RATIO = 16;                  // Bars fully visible at (rect.width / this) from edge
export const EDGE_ROTATION_THRESHOLD_RATIO = 16;             // Full rotation speed within (rect.width / this) from edge

// ============================================================================
// GEAR_INDICATOR - Gear appearance and styling
// ============================================================================

export const GEAR_SIZE_PX = 144;                             // Gear SVG width/height
export const GEAR_Z_INDEX = 999;                             // z-index for gear element
export const GEAR_COLOR_DEFAULT = '#333333';                 // Gear color when not in rotation zone
export const GEAR_COLOR_ROTATION = '#22c55e';                // Gear color when in rotation zone (green)

// ============================================================================
// INERTIA - Friction, velocity, sampling
// ============================================================================

export const INERTIA_MAX_VELOCITY_SAMPLES = 5;               // Number of velocity samples to average
export const INERTIA_FRICTION = 0.95;                        // Deceleration factor per frame
export const INERTIA_MIN_VELOCITY = 0.5;                     // Stop when velocity drops below this (pixels)
export const INERTIA_SAMPLE_WINDOW_MS = 100;                 // Only use samples within this time window

// ============================================================================
// INPUT_PREDICTION - Reduces perceived input lag
// ============================================================================

export const INPUT_PREDICTION_MS = 0;                        // Prediction lookahead (0 = disabled)
export const FINGER_VELOCITY_SMOOTHING = 0.5;                // Exponential smoothing alpha for velocity
export const FINGER_MAX_DT = 0.1;                            // Ignore huge gaps in finger update timing

// ============================================================================
// ZOOM - Thresholds, blocking, clamping
// ============================================================================

export const ZOOM_MIN_LEVEL = 1;                             // Minimum zoom level
export const ZOOM_MAX_LEVEL = 20;                            // Maximum zoom level
export const ZOOM_BLOCK_DURATION_MS = 250;                   // Guard-rail timeout before zoom activates
export const ZOOM_AREA_THRESHOLD = 1000;                     // Signed area threshold for zoom activation (normal mode)
export const ZOOM_ALT1_THRESHOLD = 500;                      // Threshold for Alt1 mode zoom activation
export const ZOOM_RATE_COEFF = 20;                           // Coefficient for zoom rate calculation
export const ZOOM_FULL_CIRCLES_MULT = 2.0;                   // Multiplier for fullCircles in compound value
export const ZOOM_WHEEL_SENSITIVITY = 0.002;                 // Wheel delta multiplier for zoom

export const PAN_THRESHOLD = 0.1;                            // Minimum pan distance to trigger movement

// ============================================================================
// VISUALIZATION - Trail, circles, colors, timing
// ============================================================================

// Trail visualizer
export const TRAIL_DURATION_MS = 250;                        // Trail point lifetime in milliseconds
export const TRAIL_CIRCLE_RADIUS = 6;                        // Radius of the drag point circle (2x line width)
export const TRAIL_LINE_WIDTH = 3;                           // Width of the trail line
export const TRAIL_STROKE_COLOR = 'rgba(70, 70, 70, 0.8)';   // Trail line color
export const TRAIL_FILL_COLOR = 'rgba(70, 70, 70, 0.8)';     // Drag point fill color

export const TRAIL_TRIANGLE_COLOR_POSITIVE = 'rgba(255, 0, 0, 0.4)';    // CCW triangle fill (zoom out)
export const TRAIL_TRIANGLE_COLOR_NEGATIVE = 'rgba(0, 100, 255, 0.4)';  // CW triangle fill (zoom in)
export const TRAIL_CIRCLE_COLOR_POSITIVE = 'rgba(255, 0, 0, 0.8)';      // Area circle stroke (positive)
export const TRAIL_CIRCLE_COLOR_NEGATIVE = 'rgba(0, 100, 255, 0.8)';    // Area circle stroke (negative)
export const TRAIL_THRESHOLD_COLOR = 'rgba(0, 180, 0, 0.8)';            // Green threshold circle stroke
export const TRAIL_THRESHOLD_FILL_COLOR = 'rgba(0, 180, 0, 0.4)';       // Green threshold circle fill (when blocked)

export const VIRTUAL_TOUCH_DURATION_MS = 2000;               // Virtual touch point lifetime after release

// Spiral arc visualization
export const SPIRAL_BASE_RADIUS = 40;                        // Starting radius of the spiral arc
export const SPIRAL_RADIUS_GROWTH = 5;                       // Radius growth per full circle
export const SPIRAL_SEGMENTS = 100;                          // Number of line segments in spiral
export const SPIRAL_LINE_WIDTH = 4;                          // Line width for spiral arc
export const SPIRAL_START_ANGLE = -Math.PI / 2;              // Start angle at top

// Indicator circle positions
export const AREA_CIRCLE_X_RATIO = 3;                        // Left circle at (canvas.width / this)
export const PRODUCT_CIRCLE_X_RATIO = 1.5;                   // Right circle at (canvas.width * 2 / this)
export const INDICATOR_CIRCLE_DEFAULT_Y = 110;               // Default Y position if element not found
export const INDICATOR_CIRCLE_SCALE = 0.5;                   // Scale factor for area/product circle radius
export const INDICATOR_STROKE_WIDTH = 3;                     // Stroke width for indicator circles

// Zoom display text
export const ZOOM_TEXT_FONT = 'bold 16px sans-serif';        // Font for zoom display
export const ZOOM_TEXT_COLOR = 'rgba(70, 70, 70, 0.9)';      // Color for zoom display
export const ZOOM_TEXT_X_OFFSET = 10;                        // Distance from right edge

// ============================================================================
// MAP_DEFAULTS - Initial center, zoom, rotation
// ============================================================================

export const MAP_DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };  // San Francisco
export const MAP_DEFAULT_ZOOM = 12;                          // Initial zoom level
export const MAP_DEFAULT_ROTATION = 0;                       // Initial rotation in degrees

// ============================================================================
// GEOLOCATION - Timeouts, update frequency
// ============================================================================

export const GEOLOCATION_TIMEOUT_MS = 10000;                 // Timeout for getCurrentPosition
export const GEOLOCATION_FAST_TIMEOUT_MS = 2000;             // Timeout for fast network-based position
export const GEOLOCATION_FALLBACK_TIMEOUT_MS = 5000;         // Timeout for fallback query
export const GEOLOCATION_WATCH_MAX_AGE_MS = 1000;            // Maximum age for watchPosition
export const GEOLOCATION_WATCH_TIMEOUT_MS = 10000;           // Timeout for location watch

export const LOCATION_BUTTON_ZOOM = 17;                      // Zoom level when centering on user location

// ============================================================================
// ROUTES - Styling, line patterns
// ============================================================================

export const ROUTE_LINE_WIDTH = 6;                           // Route polyline width
export const ROUTE_STROKE_COLOR = '#007AFF';                 // Active route color (Apple blue)
export const ROUTE_STROKE_OPACITY = 0.9;                     // Active route opacity
export const ROUTE_TRAVELED_COLOR = '#8E8E93';               // Traveled portion color (grey)
export const ROUTE_TRAVELED_OPACITY = 0.7;                   // Traveled portion opacity

export const ROUTE_WALKING_DASH = [1, 15] as const;          // Dotted pattern for walking
export const ROUTE_CYCLING_DASH = [8, 12] as const;          // Dashed pattern for cycling
// Automobile uses solid line (no dash)

// ============================================================================
// POI - Detection thresholds
// ============================================================================

export const POI_ICON_OFFSET_Y = 35;                         // Y offset for POI icon center (pin tip vs icon)
export const POI_TAP_RADIUS = 45;                            // Tap detection radius around POI icon
export const POI_SELECT_DEBOUNCE_MS = 100;                   // Ignore clicks within this time of selection

export const MARKER_COLOR = '#e74c3c';                       // Search result marker color (red)

// ============================================================================
// UI - Button zoom levels, search timing, debug
// ============================================================================

export const SEARCH_DEBOUNCE_MS = 300;                       // Debounce delay for search input
export const SEARCH_MAX_AUTOCOMPLETE_RESULTS = 5;            // Max autocomplete suggestions shown
export const SEARCH_DEFAULT_ZOOM = 15;                       // Zoom level for place search results

export const DEBUG_TOGGLE_TAP_COUNT = 4;                     // Taps on clear button to toggle debug controls

// ============================================================================
// POI_CATEGORY_ZOOM - Minimum zoom levels for POI categories
// ============================================================================

export const POI_ZOOM_FOOD = 16;                             // Food & Drink category
export const POI_ZOOM_NIGHTLIFE = 16;                        // Nightlife & Entertainment
export const POI_ZOOM_OUTDOORS = 13;                         // Parks, beaches, nature
export const POI_ZOOM_SPORTS = 15.5;                         // Sports & Fitness
export const POI_ZOOM_SERVICES = 15.5;                       // Banks, hospitals, etc.
export const POI_ZOOM_TRAVEL = 15;                           // Hotels, airports, transit
export const POI_ZOOM_SHOPPING = 15.5;                       // Stores, malls
export const POI_ZOOM_CULTURE = 15.5;                        // Museums, libraries, landmarks
export const POI_ZOOM_HEALTH = 15.5;                         // Spas, salons, medical
export const POI_ZOOM_OTHER = 13;                            // Convention centers, fairgrounds, etc.
