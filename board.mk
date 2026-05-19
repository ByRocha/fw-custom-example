# Auto-generated board.mk for urutau
# Run ConfigDefinition through our wrapper so the generated .ini is translated before the USB MSD image is embedded
CUSTOM_GEN_CONFIG = scripts/gen_config_translated.sh

include $(BOARD_DIR)/firmware/firmware.mk

BOARDINC += $(BOARD_DIR)/generated/controllers/generated
# firmware.mk already discovers board .cpp files in BOARD_DIR.
# Do not add default_tune.cpp/board_configuration.cpp here, otherwise LTO links the same hook twice.

# defines SHORT_BOARD_NAME / PROJECT_BOARD / PROJECT_CPU
include $(BOARD_DIR)/meta-info.env

DDEFS += -UEFI_HIP_9011 -DEFI_HIP_9011=FALSE
DDEFS += -UEFI_CJ125 -DEFI_CJ125=FALSE
DDEFS += -UTS_SECONDARY_UxART_PORT -DTS_SECONDARY_UxART_PORT=SD2
DDEFS += -UEFI_TS_SECONDARY_IS_SERIAL -DEFI_TS_SECONDARY_IS_SERIAL=TRUE
DDEFS += -USTM32_SERIAL_USE_USART2 -DSTM32_SERIAL_USE_USART2=TRUE
DDEFS += -USTM32_UART_USE_USART2 -DSTM32_UART_USE_USART2=FALSE
DDEFS += -UTS_SERIAL_AF -DTS_SERIAL_AF=7
DDEFS += -UHAL_USE_SPI -DHAL_USE_SPI=TRUE
DDEFS += -USTM32_SPI_USE_SPI3 -DSTM32_SPI_USE_SPI3=TRUE
DDEFS += -UHAL_USE_SERIAL -DHAL_USE_SERIAL=TRUE
DDEFS += -USTM32_SERIAL_USART2_PRIORITY -DSTM32_SERIAL_USART2_PRIORITY=6
DDEFS += -UTS_PRIMARY_UxART_PORT
DDEFS += -UEFI_CONSOLE_TX_BRAIN_PIN
DDEFS += -UEFI_CONSOLE_RX_BRAIN_PIN

# Compress the .ini embedded in the USB MSD (gzip) to fit in flash
DDEFS += -DEFI_USE_COMPRESSED_INI_MSD=TRUE

# Translated TunerStudio .ini sources are staged from generated/tunerstudio/ by the build workflow
