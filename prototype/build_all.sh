#!/usr/bin/env bash
# Rebuild FGEHA_NLC_F14F15_UnifiedControl v1.43.0 from the baseline.
# Usage: bash build_all.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$HERE/_build"
rm -rf "$WORK" && mkdir -p "$WORK"
cp "$HERE/baseline/FGEHA_NLC_F14F15_UnifiedControl_BASELINE_v1_3_7.html" "$WORK/FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
cp "$HERE/modules/"*.js "$WORK/"
cp "$HERE/mergers/"*.py "$WORK/"
cd "$WORK"
ORDER="phase_c phase_c_s2 phase_c_s3 phase_c_s4 phase_c_s5 phase_c_s6 phase_c_s7 phase_c_s8 phase_c_s9 \
phase_d_s1 phase_d_s2 phase_d_s3 phase_d_s4 phase_d_s5 \
phase_e_s1 phase_e_s2 phase_e_s3 phase_e_s4 phase_e_s5 phase_e_s6 phase_e_s7 phase_e_s8 phase_e_s9 phase_e_s10 \
phase_e_s11 phase_e_s12 phase_e_s13 phase_e_s14 phase_e_s15 phase_e_s16 phase_e_s17 phase_e_s18 phase_e_s19 phase_e_s20 \
phase_e_s21 phase_e_s22 phase_e_s23 phase_e_s24 phase_e_s25 phase_e_s26"
for s in $ORDER; do echo "  merging $s"; python3 ${s}_merger.py >/dev/null; done
cp "$WORK/FGEHA_NLC_F14F15_UnifiedControl_v1_0.html" "$HERE/app/FGEHA_NLC_F14F15_UnifiedControl_v1_43_0.REBUILT.html"
echo "Done -> app/FGEHA_NLC_F14F15_UnifiedControl_v1_43_0.REBUILT.html"
