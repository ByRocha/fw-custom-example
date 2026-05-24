// Auto-generated default tune for urutau
#include "pch.h"

void boardTuneDefaults() {
	engineConfiguration->injector.flow = 250;
	engineConfiguration->cylindersCount = 5;
	engineConfiguration->displacement = 2000;
	engineConfiguration->cylinderBore = 81;
	engineConfiguration->cranking.rpm = 350;
	engineConfiguration->crankingTimingAngle = 4;
	// Idle target RPM (850) lives in the cltIdleRpm CLT-indexed table — tune it in TunerStudio.
	engineConfiguration->acIdleRpmTarget = 850;
	engineConfiguration->rpmHardLimit = 7200;
	engineConfiguration->stoichRatioPrimary = 14.7;
	engineConfiguration->ignitionDwellForCrankingMs = 3;
}
