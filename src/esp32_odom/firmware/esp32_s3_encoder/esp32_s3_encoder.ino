/*
 * ==============================================================================
 * ESP32-S3 Dual Quadrature Incremental Encoder Firmware
 * Target Hardware: ESP32-S3 DevKit / NodeMCU
 * 
 * Encoder Specification:
 *   - Pro-Range 600 PPR 2-Phase Incremental Rotary Optical Encoders
 *   - Quadrature 4x decoding mode (2400 edges per encoder shaft revolution)
 * 
 * Pin Configuration:
 *   - Left Encoder Channel A:  GPIO 18 (Interrupt on CHANGE)
 *   - Left Encoder Channel B:  GPIO 19 (Interrupt on CHANGE)
 *   - Right Encoder Channel A: GPIO 25 (Interrupt on CHANGE)
 *   - Right Encoder Channel B: GPIO 26 (Interrupt on CHANGE)
 * 
 * Serial Interface:
 *   - Baud Rate: 115200 bps (8N1)
 *   - Stream Rate: 50 Hz (every 20 ms)
 *   - Machine-Readable Packet: ENC,<timestamp_ms>,<left_count>,<right_count>\n
 *     Example: ENC,105230,21011,-20894
 * ==============================================================================
 */

#include <Arduino.h>

// -----------------------------------------------------------------------------
// GPIO PIN DEFINITIONS
// -----------------------------------------------------------------------------
#define LEFT_ENC_A_PIN   18
#define LEFT_ENC_B_PIN   19
#define RIGHT_ENC_A_PIN  25
#define RIGHT_ENC_B_PIN  26

// -----------------------------------------------------------------------------
// SERIAL & TELEMETRY CONFIGURATION
// -----------------------------------------------------------------------------
#define SERIAL_BAUD_RATE 115200
#define REPORT_INTERVAL_MS 20  // 50 Hz reporting rate

// -----------------------------------------------------------------------------
// VOLATILE ENCODER STATE (Protected by FreeRTOS Spinlock)
// -----------------------------------------------------------------------------
static portMUX_TYPE enc_mux = portMUX_INITIALIZER_UNLOCKED;

volatile int64_t g_left_ticks  = 0;
volatile int64_t g_right_ticks = 0;

volatile uint8_t g_left_state  = 0;
volatile uint8_t g_right_state = 0;

// Quadrature 4x Lookup Table (State transition mapping)
// Index: [prev_A, prev_B, curr_A, curr_B] -> 4 bits (0..15)
// Values: 0 = no change / invalid, +1 = forward, -1 = reverse
static const int8_t QUADRATURE_TABLE[16] = {
     0, -1,  1,  0,
     1,  0,  0, -1,
    -1,  0,  0,  1,
     0,  1, -1,  0
};

// -----------------------------------------------------------------------------
// IRAM ISR HANDLERS
// -----------------------------------------------------------------------------
void IRAM_ATTR leftEncoderISR() {
    uint8_t a = digitalRead(LEFT_ENC_A_PIN);
    uint8_t b = digitalRead(LEFT_ENC_B_PIN);
    uint8_t curr = (a << 1) | b;
    
    portENTER_CRITICAL_ISR(&enc_mux);
    uint8_t index = (g_left_state << 2) | curr;
    g_left_ticks += QUADRATURE_TABLE[index & 0x0F];
    g_left_state = curr;
    portEXIT_CRITICAL_ISR(&enc_mux);
}

void IRAM_ATTR rightEncoderISR() {
    uint8_t a = digitalRead(RIGHT_ENC_A_PIN);
    uint8_t b = digitalRead(RIGHT_ENC_B_PIN);
    uint8_t curr = (a << 1) | b;
    
    portENTER_CRITICAL_ISR(&enc_mux);
    uint8_t index = (g_right_state << 2) | curr;
    g_right_ticks += QUADRATURE_TABLE[index & 0x0F];
    g_right_state = curr;
    portEXIT_CRITICAL_ISR(&enc_mux);
}

// -----------------------------------------------------------------------------
// SETUP
// -----------------------------------------------------------------------------
void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    // Allow USB CDC serial on ESP32-S3 time to enumerate
    delay(500);

    // Configure encoder pins with internal pullups
    pinMode(LEFT_ENC_A_PIN, INPUT_PULLUP);
    pinMode(LEFT_ENC_B_PIN, INPUT_PULLUP);
    pinMode(RIGHT_ENC_A_PIN, INPUT_PULLUP);
    pinMode(RIGHT_ENC_B_PIN, INPUT_PULLUP);

    // Initial state capture
    uint8_t left_a  = digitalRead(LEFT_ENC_A_PIN);
    uint8_t left_b  = digitalRead(LEFT_ENC_B_PIN);
    g_left_state = (left_a << 1) | left_b;

    uint8_t right_a = digitalRead(RIGHT_ENC_A_PIN);
    uint8_t right_b = digitalRead(RIGHT_ENC_B_PIN);
    g_right_state = (right_a << 1) | right_b;

    // Attach hardware interrupts on all state transitions (4x quadrature decoding)
    attachInterrupt(digitalPinToInterrupt(LEFT_ENC_A_PIN), leftEncoderISR, CHANGE);
    attachInterrupt(digitalPinToInterrupt(LEFT_ENC_B_PIN), leftEncoderISR, CHANGE);
    attachInterrupt(digitalPinToInterrupt(RIGHT_ENC_A_PIN), rightEncoderISR, CHANGE);
    attachInterrupt(digitalPinToInterrupt(RIGHT_ENC_B_PIN), rightEncoderISR, CHANGE);

    // Send single diagnostic startup header (comment format '#' ignored by machine parser)
    Serial.println(F("# ESP32-S3 Dual Quadrature Encoder Firmware v2.0 Ready"));
    Serial.println(F("# Pins: Left(18,19), Right(25,26) | Mode: 4x | Baud: 115200"));
}

// -----------------------------------------------------------------------------
// MAIN LOOP
// -----------------------------------------------------------------------------
void loop() {
    static uint32_t last_report_time = 0;
    uint32_t now = millis();

    // Periodic telemetry publication
    if (now - last_report_time >= REPORT_INTERVAL_MS) {
        last_report_time = now;

        int64_t left_copy;
        int64_t right_copy;

        // Atomically copy volatile tick counters
        portENTER_CRITICAL(&enc_mux);
        left_copy  = g_left_ticks;
        right_copy = g_right_ticks;
        portEXIT_CRITICAL(&enc_mux);

        // Machine-readable format: ENC,<timestamp_ms>,<left_count>,<right_count>
        Serial.print(F("ENC,"));
        Serial.print(now);
        Serial.print(F(","));
        Serial.print((long long)left_copy);
        Serial.print(F(","));
        Serial.println((long long)right_copy);
    }

    // Optional incoming command handling (e.g., software reset or zeroing)
    if (Serial.available() > 0) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.equalsIgnoreCase("RESET") || cmd.equalsIgnoreCase("ZERO")) {
            portENTER_CRITICAL(&enc_mux);
            g_left_ticks  = 0;
            g_right_ticks = 0;
            portEXIT_CRITICAL(&enc_mux);
            Serial.println(F("# OK,ENCODERS_ZEROED"));
        }
    }
}
