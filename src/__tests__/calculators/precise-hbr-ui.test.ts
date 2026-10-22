import { afterEach, describe, expect, test } from '@jest/globals';
import { preciseHbr } from '../../calculators/precise-hbr/index.js';

describe('PRECISE-HBR UI hemoglobin units', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('12 g/dL and 120 g/L produce the same displayed score', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        container.innerHTML = preciseHbr.generateHTML();
        preciseHbr.initialize(null, null, container);
        // Let initialization finish before entering patient values; no FHIR client is used.
        await Promise.resolve();

        const input = (name: string) =>
            container.querySelector<HTMLInputElement>(`#precise-hbr-${name}`)!;
        for (const [name, value] of Object.entries({ age: 30, hb: 12, egfr: 100, wbc: 3 })) {
            input(name).value = String(value);
        }
        const hb = input('hb');
        hb.dispatchEvent(new Event('input', { bubbles: true }));

        const displayedScore = () =>
            container.querySelector('#precise-hbr-result .ui-result-score .ui-result-value')
                ?.textContent;
        const scoreInGramsPerDeciliter = displayedScore();
        expect(scoreInGramsPerDeciliter).toBe('10points');

        const toggle = hb.closest('.unit-converter-wrapper')!.querySelector('button')!;
        toggle.click();
        expect(toggle.textContent).toBe('g/L');
        expect(Number(hb.value)).toBe(120);
        expect(displayedScore()).toBe(scoreInGramsPerDeciliter);

        // Also exercise manually entered g/L and conversion back to g/dL.
        hb.value = '120';
        hb.dispatchEvent(new Event('input', { bubbles: true }));
        expect(displayedScore()).toBe(scoreInGramsPerDeciliter);
        toggle.click();
        expect(toggle.textContent).toBe('g/dL');
        expect(Number(hb.value)).toBe(12);
        expect(displayedScore()).toBe(scoreInGramsPerDeciliter);
    });
});
