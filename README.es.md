# JevCraft

[![CI](https://github.com/nft-syou/jevcraft-bench/actions/workflows/ci.yml/badge.svg)](https://github.com/nft-syou/jevcraft-bench/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen)](.node-version)
[![Paper](https://img.shields.io/badge/paper-26.2%20%C2%B7%20java%2025-orange)](plugin/)
![Shadow mode](https://img.shields.io/badge/shadow%20mode-never%20bans%20or%20kicks-8250df)
![Corpus](https://img.shields.io/badge/corpus-156%20labelled%20sessions-informational)

[English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [한국어](README.ko.md) · **Español**

> Esta es una traducción. Si algo no concuerda, manda la [versión en inglés](README.md).

Banco de pruebas de investigación en antitrampas por comportamiento para servidores de Minecraft (Paper). La telemetría de una sesión de minado se reduce a un objeto de características pequeño, TypeSafe Jev responde unas cuantas preguntas tipadas sobre él, y los resultados se puntúan sin conexión contra sesiones etiquetadas.

Las etiquetas son asignaciones de escenario, no juicios humanos sobre trampas observadas: una sesión cuenta como X-Ray porque el bot que la produjo estaba ejecutando un escenario de X-Ray, y como legítima porque la produjo un escenario legítimo o una persona jugando. Nadie miró una grabación y dictaminó sobre ella.

Este repositorio es una prueba de concepto. **Nunca** banea, expulsa ni revierte a jugadores. Lo más fuerte que produce es una solicitud de revisión humana.

## Estado

Las fases 0 a 3 están implementadas: el corte vertical sin conexión, el plugin de telemetría para Paper, el extractor de características y grabaciones reales en mundos de semilla fija. El corpus son **156 sesiones etiquetadas** repartidas en dos semillas de mundo, provenientes de bots de Mineflayer y de un jugador humano.

![Cómo un bloque roto acaba siendo una solicitud de revisión](docs/images/pipeline.svg)

El plugin nunca llama a la API de Jev; la evaluación es un paso aparte, sin conexión, sobre el JSONL que el plugin escribe. La especificación original está en `docs/handoff/JevCraft_IMPLEMENTATION_HANDOFF.md` y el resultado actual en `docs/evasion.md`.

## Requisitos

- Node.js 24 (`.node-version`)
- pnpm (versión fijada en `packageManager` de `package.json`)
- Opcional: una clave de API de TypeSafe en `TYPESAFE_API_KEY` para evaluación en vivo

## Inicio rápido

```bash
pnpm install
pnpm test
pnpm jevcraft evaluate datasets/fixtures/xray-direct-001.json
```

Sin `TYPESAFE_API_KEY`, la CLI usa un backend simulado determinista y lo indica por stderr. Las decisiones se escriben en `datasets/decisions/<input>.jsonl` (fuera de Git).

### Evaluación en vivo

```bash
cp .env.example .env   # después pon tu clave en TYPESAFE_API_KEY
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --out datasets/decisions/fixtures-live.jsonl
```

`pnpm jevcraft` carga `.env` si existe (el `--env-file-if-exists` de Node); una variable `TYPESAFE_API_KEY` exportada también funciona. La clave solo se lee del entorno. Nunca la subas al repositorio.

### Informe de evaluación

```bash
pnpm jevcraft evaluate datasets/fixtures --backend mock --out datasets/decisions/fixtures.jsonl
pnpm jevcraft report --decisions datasets/decisions/fixtures.jsonl --labels datasets/labels/fixtures.jsonl
```

Genera `reports/fixtures.md` con la matriz de confusión, Precision / Recall / **FPR** / FNR / F1, un barrido de umbrales sobre `P(likely_xray)`, desgloses por subtipo y por banda de confianza, percentiles de latencia, totales de tokens y la lista de falsos positivos y falsos negativos.

### Más ensayos: repeticiones y sesiones sintéticas

```bash
# Los mismos 5 fixtures, 10 veces cada uno, para medir la varianza de las respuestas de Jev
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --repeat 10 --out datasets/decisions/fixtures-x10.jsonl

# 7 escenarios x 20 sesiones sintéticas (deterministas por semilla), luego evaluar e informar
pnpm jevcraft generate scenarios --count 20 --seed 1   --out-features datasets/generated/seed1-features.jsonl --out-labels datasets/generated/seed1-labels.jsonl
pnpm jevcraft evaluate datasets/generated/seed1-features.jsonl --backend typesafe --out datasets/decisions/seed1.jsonl
pnpm jevcraft report --decisions datasets/decisions/seed1.jsonl --labels datasets/generated/seed1-labels.jsonl
```

En ese caso el informe incluye además una tabla de varianza entre repeticiones y un barrido sobre `minEvidenceSufficiency`. Los resultados archivados de ejecuciones reales están en `docs/baselines/`.

## Plugin de Paper (fase 2)

`plugin/` es un plugin de servidor Paper que registra, solo en modo sombra:

- movimiento muestreado (umbrales de tiempo, distancia y rotación, con un búfer circular de 90 s que se vuelca al empezar una sesión),
- roturas de bloques dentro de una sesión de minado,
- la primera exposición de minerales valiosos ocultos (regla de los 6 vecinos, especificación §7),
- los límites de una sesión de minado (la abren roturas de piedra bajo tierra o cualquier exposición de mineral; la cierran el tiempo de inactividad, la desconexión, el cambio de mundo, un teletransporte lejano, el cambio de modo de juego o `/jevcraft flush`).

Todo va a `plugins/JevCraft/data/<serverRunId>.jsonl` a través de una cola acotada y un hilo escritor demonio; cuando la cola se llena, las líneas se descartan y se cuentan, y nunca se bloquea el tick. Los identificadores de jugador son `hmac-sha256:<hex>` derivados de `JEVCRAFT_HMAC_SECRET`; los UUID y nombres reales no se escriben nunca. El plugin no banea, ni expulsa, ni revierte.

> **El servidor de compose es para un banco de pruebas aislado, no para internet.** Corre con `ONLINE_MODE: "false"`, así que nunca comprueba quién se conecta, y concede operador a 16 UUID offline fijos para que los bots de grabación puedan teletransportarse y usar `/fill`. Cualquiera que alcance el puerto puede entrar como `jevbotNN` y obtener esos permisos. Por eso escucha solo en `127.0.0.1`. No lo publiques en una interfaz pública ni reutilices este archivo de compose para un servidor real.

**Todo el trabajo de JVM se ejecuta en Docker; no se instala ningún JDK en el equipo.**

```bash
pnpm plugin:test     # docker compose -f infra/docker-compose.yml run --rm gradle test
pnpm plugin:build    # ... gradle build  -> plugin/build/libs/JevCraft-<version>.jar
docker compose -f infra/docker-compose.yml up paper   # servidor Paper local con el jar montado
```

Convertir una ejecución del servidor en características y evaluarla:

```bash
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/run-001.jsonl
pnpm jevcraft evaluate datasets/features/run-001.jsonl --out datasets/decisions/run-001.jsonl
```

`extract` agrupa los eventos por sesión, parte las sesiones más largas que `--window-minutes` (15 por defecto) en ventanas `<sessionId>:w<n>` y calcula las características de la especificación §9: rectitud, ratio de rodeo y alineación de la mirada a partir de los 60 s de movimiento previos a cada exposición de mineral oculto; probabilidad de minado en ramas y direcciones de túnel a partir de la geometría de las roturas; exposición a cuevas a partir de las caras vecinas abiertas; ritmo de rotura y cobertura de la trayectoria. Todo lo no observado es `null`.

### Grabaciones con bots (fase 3 sin personas)

`@jevcraft/bot-recorder` dirige bots de Mineflayer contra el servidor de compose para producir telemetría *real* del plugin a escala. Un bot de X-Ray no es una simulación: lee posiciones de mineral de datos de chunk que jamás podría ver de forma legítima, que es exactamente lo que hace un cliente tramposo. El bot legítimo solo reacciona a bloques con una cara abierta.

```bash
docker compose -f infra/docker-compose.yml up -d paper       # semilla fija, modo pacífico, bots con OP
JEVCRAFT_HMAC_SECRET=change-me-local-only   pnpm jevcraft record --scenario all --count 5 --budget-seconds 240 --out datasets/recordings/batch1.jsonl
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/batch1.jsonl
pnpm jevcraft label-runs --raw infra/paper/data/plugins/JevCraft/data --manifest datasets/recordings/batch1.jsonl --out datasets/labels/batch1.jsonl
# opcional: efficiency.baselinePercentile contra las sesiones legítimas que ya tengas
pnpm jevcraft baseline --features datasets/features/batch1.jsonl --labels datasets/labels/batch1.jsonl --out datasets/baselines/legit.json
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --baseline datasets/baselines/legit.json --out datasets/features/batch1.jsonl
pnpm jevcraft evaluate datasets/features/batch1.jsonl --out datasets/decisions/batch1.jsonl
pnpm jevcraft report --decisions datasets/decisions/batch1.jsonl --labels datasets/labels/batch1.jsonl
```

Escenarios: `legit-branch-mining`, `xray-direct`, `xray-detour`, `xray-humanized` y `xray-throttled` (`packages/bot-recorder/src/scenarios.ts`). El último mantiene su ratio de mineral dentro del rango legítimo a propósito; véase `docs/evasion.md`.

Cada ejecución entra como `jevbotNN`, se teletransporta a una celda nueva de 64 bloques, mina durante el tiempo asignado y se marcha; el manifiesto registra el identificador seudónimo del bot (el mismo HMAC que usa el plugin, calculado a partir del UUID offline y el secreto) y la ventana temporal, de modo que `label-runs` puede adjuntar la verdad de referencia a las sesiones del plugin sin que este escriba nunca un nombre. Mineflayer habla el protocolo 26.1; el servidor ejecuta ViaVersion + ViaBackwards para poder aceptar 26.2.

Otro mundo: `JEVCRAFT_SEED=jevcraft-arena-2 JEVCRAFT_LEVEL=arena2 docker compose -f infra/docker-compose.yml up -d paper` (la semilla solo se aplica cuando la carpeta del nivel se crea por primera vez). `scripts/session-table.mjs` y `scripts/gate-sweep.mjs` imprimen tablas por sesión y barren la puerta de aproximación sobre decisiones archivadas, sin llamadas a la API.

Los bots se mueven y miran con más regularidad que las personas (`--human-noise` lo suaviza). Usa los datos de bots como el grueso del conjunto para el cableado, el extractor y el trabajo de umbrales, y guarda un conjunto pequeño jugado por personas para la comprobación final de falsos positivos (especificación de traspaso §22).

Comandos de administración (`jevcraft.admin`, OP por defecto): `/jevcraft status`, `/jevcraft session <player>`, `/jevcraft flush <player>`, `/jevcraft metrics`. Configuración en `plugin/src/main/resources/config.yml`. El formato de línea del JSONL está reflejado por `RawTelemetryEventSchema` en `@jevcraft/schema`, y `datasets/fixtures/raw/sample.jsonl` (escrito por la prueba de MockBukkit del plugin) se valida con él.

Las desviaciones respecto a la especificación de traspaso están registradas en `docs/superpowers/plans/2026-09-19-paper-telemetry-plugin.md`: Paper `26.2.build.124-stable` requiere Java 25 (la especificación decía 21) y los comandos se declaran en `plugin.yml` y no en `paper-plugin.yml`.

## Comparativa frente a las heurísticas existentes

`jevcraft benchmark` ejecuta las heurísticas en las que se apoyan las herramientas anti-X-Ray existentes (ratio de mineral, ratio de exposiciones, percentil de eficiencia, ritmo de exposiciones, rectitud de la aproximación, una combinación escrita a mano y una regresión logística ajustada sobre el conjunto de desarrollo) frente a JevCraft, sobre las mismas sesiones etiquetadas y con el mismo techo de falsos positivos, usando únicamente respuestas de Jev archivadas.

`datasets/splits2/` está en el repositorio, así que esto funciona desde un clon recién hecho, sin servidor, sin grabaciones y sin clave de API:

```bash
pnpm jevcraft benchmark   --features datasets/splits2/holdout-features.jsonl   --labels   datasets/splits2/holdout-labels.jsonl   --decisions datasets/splits2/holdout-decisions.jsonl   --dev-features datasets/splits2/dev-features.jsonl   --dev-labels   datasets/splits2/dev-labels.jsonl   --dev-decisions datasets/splits2/dev-decisions.jsonl   --max-fpr 0.072 --out reports/benchmark-evasive.md
```

Esas particiones contienen 134 de las 156 sesiones: 77 de desarrollo y 57 reservadas. Las 22 restantes son el conjunto de confirmación, que se puntúa aparte en `docs/evasion.md` y se deja fuera de esta comparativa a propósito. `scripts/make-splits.mjs` reconstruye las particiones a partir de un conjunto completo de características y decisiones, que solo tendrá quien haya ejecutado el grabador.

Los umbrales se eligen sobre el conjunto de desarrollo y se congelan; sin `--dev-*`, el informe avisa en su encabezado de que sus números describen ajuste y no generalización.

Frente a bots de X-Ray codiciosos no hay ninguna ventaja: contar mineral ya resuelve ese caso. El caso interesante es un tramposo que mantiene sus números en lo corriente, y `xray-throttled` es ese tramposo. Lee posiciones de mineral de los datos de chunk igual que los demás bots de X-Ray, y luego cava túnel corriente entre objetivos hasta que su ratio de mineral vuelve a caer dentro del rango legítimo.

![Distribución del mineral valioso extraído por cada 100 bloques rotos, por tipo de sesión](docs/images/ore-ratio-distribution.svg)

Funciona. Ninguna de las 25 sesiones frenadas alcanza el umbral del ratio de mineral, y ocupan una franja más estrecha que el minado legítimo, de modo que no hay corte que las separe sin señalar también a jugadores corrientes. Lo que la trampa no puede ocultar es el camino hasta el mineral.

![Proporción de sesiones de X-Ray frenado detectadas, por detector y cohorte](docs/images/throttled-detection.svg)

Las 15 sesiones reservadas son precisamente las que motivaron la regla de aproximación de la política, así que no pueden confirmarla. Las 10 sesiones de confirmación se grabaron después de congelar esa regla.

Esa es una evasión, no la evasión en general. Serpentear de camino a un mineral cuya posición ya conoces derrota la regla de aproximación con la misma contundencia con la que diluir el ratio derrota al conteo:

![Sensibilidad por estilo de evasión de X-Ray](docs/images/detector-complementarity.svg)

Así que la aportación está en la telemetría de aproximación, no en el modelo de lenguaje: con estos datos, una regla de rectitud escrita a mano rinde igual que Jev. El resultado completo, incluido cuánto de él estaba registrado de antemano, está en `docs/evasion.md`, y el método en `docs/benchmark.md`.

## Coste de operación

Medido sobre 156 evaluaciones en vivo (`xray-v6`, `jev-1.13.0`): **1.402 tokens de entrada y 137 de salida por ventana de sesión**, con una dispersión inferior al 3 %. TypeSafe factura solo la entrada, a 0,042 $ por millón de tokens, y la salida es gratuita, así que juzgar una ventana cuesta **0,000059 $**, es decir unas 17.000 ventanas por dólar.

El volumen de llamadas depende del tiempo de minado subterráneo, no del número de jugadores. El plugin abre una sesión tras 10 roturas de piedra a y=40 o por debajo, o ante cualquier exposición de mineral objetivo, la cierra tras 120 s de inactividad, y el extractor la corta en ventanas de 15 minutos. El único jugador humano grabado hasta ahora produjo 11 ventanas en 66 minutos de minado, es decir alrededor de **10 ventanas por hora de minado y jugador**. Esa única muestra de 82 minutos es el número más débil de toda la estimación y escala la tabla entera de forma lineal.

Coste mensual **tal y como se comporta el código hoy**, que envía todas las ventanas. `evaluate-session.ts` llama primero al backend y solo después aplica la política, así que `enoughEvidence` decide el resultado pero no ahorra nada; una sesión sin pruebas aprovechables también se paga.

| Perfil de servidor | Horas-jugador al mes | 25 % bajo tierra | 50 % bajo tierra | Al año con 50 % |
| --- | --- | --- | --- | --- |
| Solo amigos, 4 jugadores 4 h/día | 480 | 0,07 $ | 0,14 $ | 1,70 $ |
| Público pequeño, 5 concurrentes de media | 3.650 | 0,54 $ | 1,07 $ | 13 $ |
| Público pequeño, 10 concurrentes de media | 7.300 | 1,07 $ | 2,15 $ | 26 $ |
| Concurrido, 30 concurrentes de media | 21.900 | 3,22 $ | 6,45 $ | 77 $ |
| Grande, 100 concurrentes de media | 73.000 | 11 $ | 21 $ | 258 $ |

El coste es recurrente y por consumo, y sigue la actividad de los jugadores, así que no se puede limitar de antemano. Las contramedidas contra X-Ray que usan hoy los servidores no son por consumo: Paper incluye ofuscación anti-X-Ray de fábrica, Orebfuscator es de código abierto, y los plugins antitrampas por comportamiento asentados son gratuitos o de pago único.

Como la salida es gratuita, reducir el coste significa recortar llamadas o acortar el prompt. Ninguna de las dos cosas está implementada. Con 100 concurrentes de media y un 25 % bajo tierra, esto es lo que valdría cada una:

| | Al mes |
| --- | --- |
| todas las ventanas, tal como funciona hoy | 11 $ |
| omitir las ventanas que ya fallan `enoughEvidence` en local, el 16 % de ellas | 9,03 $ |
| añadir además un prefiltro barato de rectitud y ratio de mineral, manteniendo 59 de 59 detecciones en el conjunto de 134 sesiones | 6,77 $ |
| todas las ventanas, evaluadas tres veces para amortiguar la varianza de las respuestas | 32 $ |

## Paquetes

| Paquete | Responsabilidad |
| --- | --- |
| `@jevcraft/schema` | Contratos de Zod: `MiningSessionFeatures`, `DecisionRecord`, `SessionLabel` |
| `@jevcraft/jev-evaluator` | Conjunto de preguntas `xray-v1`, backend del SDK de TypeSafe, backend simulado, política de decisión |
| `@jevcraft/eval-runner` | Unión con etiquetas, métricas, informe en Markdown |
| `@jevcraft/feature-extractor` | JSONL crudo del plugin -> `MiningSessionFeatures` (definiciones de la especificación §9; ventanas de 15 min) |
| `@jevcraft/scenario-generator` | Sesiones sintéticas a nivel de características a partir de `scenarios/*.json` (especificación §13A) |
| `@jevcraft/bot-recorder` | Bots de Mineflayer que interpretan escenarios legítimos o de X-Ray en el servidor de compose (especificación §13B) |
| `@jevcraft/cli` | `pnpm jevcraft extract` / `evaluate` / `report` / `generate` / `record` / `label-runs` |

## Cómo se juzga una sesión

Una petición por sesión de minado. A Jev se le hacen cinco preguntas independientes:

| Clave | Tipo | Significado |
| --- | --- | --- |
| `behavior_class` | choice | `legit` / `suspicious` / `likely_xray` / `insufficient_evidence` con una distribución de probabilidad completa y una confianza |
| `hidden_information_use` | noul | P(el jugador actuó sobre información oculta de la posición del mineral) |
| `route_naturalness` | score 0..4 | 0 = muy poco natural, 4 = muy natural (`normalized = score / 4`) |
| `evidence_sufficiency` | noul | P(hay pruebas suficientes para clasificar) |
| `approach_targeting` (v6 en adelante) | noul | P(el movimiento previo a las exposiciones fue una aproximación deliberada, juzgado solo a partir de `hiddenOreApproach`) |

Los conjuntos de preguntas están versionados (`--questions xray-v1` … `xray-v6`, v6 por defecto) y la versión queda guardada en cada registro de decisión, de modo que se pueden comparar conjuntos sobre el mismo dataset. En `docs/baselines/README.md` está cómo se eligió cada versión.

La política (`packages/jev-evaluator/src/policy.ts`) convierte todo esto en `insufficient_evidence` / `high_priority_review` / `review` / `no_action`. `jevcraft repolicy` reescribe decisiones archivadas con otros umbrales y anota lo que aplicó en un `.meta.json` junto a su salida. `confidence` es un estadístico sobre la forma de la distribución y no es `P(likely_xray)`.

Los umbrales salen del conjunto de desarrollo de 77 sesiones, con una excepción que importa: `reviewApproachTargetingAlone = 0.35` se añadió después de que ya se hubieran puntuado las sesiones sobre las que se midió por primera vez. Su efecto ahí es una hipótesis, no una medición. Un conjunto de 22 sesiones grabado después de congelar la regla da 9 de 10 detectadas, frente a 3 de 10 sin ella. La cronología y la comparación antes y después están en `docs/evasion.md`.

## Higiene de los datos

- Los valores ausentes son `null`, nunca `0`.
- Los identificadores de jugador deben ser seudónimos. Ningún dataset puede contener UUID reales, nombres, chat ni direcciones IP.
- `datasets/private/`, `datasets/decisions/` y `reports/` quedan fuera de Git.
- Los fixtures de `datasets/fixtures` prueban que el cableado funciona; no son prueba de exactitud.

## Desarrollo

```bash
pnpm check            # lint + typecheck + test
pnpm format           # aplica el formateo de Biome
pnpm figures          # redibuja docs/images/*.svg a partir de docs/figure-data.json
pnpm figures:refresh  # recalcula antes esos agregados a partir de los datasets
```

CI ejecuta los mismos comandos más una evaluación simulada, y vuelve a generar las figuras. Ese paso falla si los SVG del repositorio se han desviado de los agregados del repositorio, o si el tamaño del corpus indicado en la insignia y en la sección de estado ya no coincide con los datos. Desde CI nunca se hacen llamadas reales a Jev.

Las figuras se generan, nunca se editan a mano. Los datasets a nivel de sesión quedan fuera de Git, así que `scripts/make-figures.mjs` guarda sus entradas en `docs/figure-data.json`, que sí está en el repositorio y es lo único que CI necesita.

## Archivos del proyecto

| Archivo | Para qué sirve |
| --- | --- |
| `CONTRIBUTING.md` | Cómo proponer un cambio y las reglas que debe cumplir |
| `CODE_OF_CONDUCT.md` | Normas de la comunidad, más las reglas de no publicar trampas funcionales ni datos de jugadores |
| `SECURITY.md` | Cómo informar en privado de una vulnerabilidad o un problema de privacidad |
| `CHANGELOG.md` | Qué cambió, y qué afirmaciones se retiraron y por qué |
| `CITATION.cff` | Cómo citar este banco de pruebas |

## Licencia

MIT. Véase `LICENSE`.
