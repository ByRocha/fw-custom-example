# urutauNCKZ

Custom firmware para RusEFI gerada pelo **RusEFI Custom Firmware Studio**.

## Base
Esta firmware é compilada **sobre a board upstream `urutau`** (pasta `firmware/config/boards/urutau` do submódulo rusefi).
Os arquivos deste arquivo são overrides — só alteram o que você customizou; tudo o mais é herdado da board base.

## Como usar
1. Faça fork de https://github.com/rusefi/fw-custom-example
2. Substitua os arquivos do fork pelos deste arquivo zip
3. Faça push para o GitHub — o Actions compila a firmware
4. O artefato `.ini` é baixado automaticamente pelo TunerStudio quando `SHORT_BOARD_NAME` está correto

## Arquivos no pacote
- `meta-info.env` — identificação (SHORT_BOARD_NAME=urutau / PROJECT_CPU=ARCH_STM32F4)
- `board.mk` — flags de build e includes
- `board_configuration.cpp` — overrides de pinos sobre a board base (`setBoardDefaultConfiguration`)
- `default_tune.cpp` — tune default embutido
- `prepend.txt` — overrides do `.ini` (linhas `name = value`). A linha `signature = "..."` é gerada automaticamente pelo build do rusEFI a partir do `SHORT_BOARD_NAME` + hash do `.ini` e NÃO é sobrescrita.
- `board_config.txt` — overrides extras do `.ini` aplicados só nesta board
- `knock_config.h` — config de detonação
- `connectors/custom_firmware.yaml` — nomes amigáveis dos pinos no TunerStudio
- `generated/tunerstudio/*.ini` — (se gerado) `.ini` traduzido(s), copiados para `ext/rusefi/firmware/tunerstudio/generated/` antes do build. A assinatura do `.ini` é mantida intacta — o build do rusEFI a regenera a partir do nome da board.
- `.github/workflows/build-firmware.yaml` — workflow que compila e publica firmware + .ini traduzido (substitui a workflow padrão do template `fw-custom-example`; as outras `*.yaml` foram neutralizadas)
- `ramdisk/*` — arquivos do disco USB virtual (README + atalhos .url)

## Disco USB virtual (MSD)
Arquivos em `ramdisk/` são copiados para `ext/rusefi/firmware/hw_layer/mass_storage/custom_extra/` no CI e a variável `EXTRA_FILES_TO_COPY_ON_IMAGE_FOLDER` aponta o build para essa pasta.
- Compressão do .ini: **LIGADA (default rusEFI)**
- Tamanho da imagem FAT: **256 KiB**
- O step `Inspect generated USB MSD FAT image` no Actions imprime `mdir` da imagem final — útil para confirmar se todos os arquivos entraram.
- A imagem `build/ramdisk*.img` é publicada como artefato para inspeção local.
