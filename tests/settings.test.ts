import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  emptyForm,
  formFromSettings,
  parsePercent,
  settingsFromForm,
  splitMaskWords,
} from '../src/domain';
import type { Settings, SettingsForm } from '../src/domain';
import {
  createConnectorContext,
  createInitialSettings,
  loadSettings,
  saveSettings,
  updateSettings,
} from '../src/app/settingsService';
import { base64ToBytes } from '../src/crypto';
import { EncryptedStore } from '../src/storage';

const BASE = { idSecret: 'c2VjcmV0LWludmVudGUtcG91ci1sZXMtdGVzdHM=', accounts: {} };

/** Valeurs entièrement inventées. */
function validForm(): SettingsForm {
  const form = emptyForm();
  form.income = '2 300,00';
  form.payDay = '5';
  form.overdraftLimit = '800';
  form.overdraftRate = '16,5';
  form.loans = [{ id: 'loan-1', label: 'Crédit exemple', payment: '250,50', rate: '3,2', endDate: '2029-06-30' }];
  form.envelopes[0].cap = '1200';
  form.envelopes[1].cap = '300,00';
  form.envelopes[2].cap = '100';
  form.maskWords = 'Dupond\nRue des Exemples, Société Exemple';
  return form;
}

describe('pourcentages', () => {
  it('lit les pourcentages français et refuse le reste', () => {
    expect(parsePercent('7,5')).toBe(7.5);
    expect(parsePercent('7.5')).toBe(7.5);
    expect(parsePercent('7,5 %')).toBe(7.5);
    expect(parsePercent('16')).toBe(16);
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('100')).toBe(100);
    for (const bad of ['', 'abc', '-1', '100,1', '1,2345', '1,2,3', '%']) expect(parsePercent(bad)).toBeNull();
  });
});

describe('validation des réglages', () => {
  it('accepte un formulaire valide et convertit en centimes entiers', () => {
    const r = settingsFromForm(validForm(), BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.monthlyIncomeCents).toBe(230000);
    expect(r.value.payDay).toBe(5);
    expect(r.value.overdraftLimitCents).toBe(80000);
    expect(r.value.overdraftRatePercent).toBe(16.5);
    expect(r.value.loans).toEqual([
      { id: 'loan-1', label: 'Crédit exemple', monthlyPaymentCents: 25050, annualRatePercent: 3.2, endDate: '2029-06-30' },
    ]);
    expect(r.value.envelopes.map((e) => e.capCents)).toEqual([120000, 30000, 10000]);
    expect(r.value.envelopes.map((e) => e.name)).toEqual(['Vie obligatoire', 'Vie plaisir assumée', 'Imprévus']);
    expect(r.value.maskWords).toEqual(['Dupond', 'Rue des Exemples', 'Société Exemple']);
    expect(r.value.idSecret).toBe(BASE.idSecret);
  });

  it('signale chaque champ invalide, avec un message en français', () => {
    const form = validForm();
    form.income = 'beaucoup';
    form.payDay = '0';
    form.overdraftLimit = '-5';
    form.loans[0].payment = '0';
    form.loans[0].rate = '300';
    form.loans[0].endDate = '2029-02-30';
    form.envelopes[0].name = '  ';
    form.envelopes[1].cap = 'x';
    const r = settingsFromForm(form, BASE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    for (const field of [
      'income',
      'payDay',
      'overdraftLimit',
      'loans.0.payment',
      'loans.0.rate',
      'loans.0.endDate',
      'envelopes.0.name',
      'envelopes.1.cap',
    ]) {
      expect(r.errors[field], field).toBeTruthy();
    }
  });

  it('jour de versement : 1 à 31 seulement', () => {
    for (const day of ['0', '32', '', 'x', '1.5', '-3']) {
      const form = validForm();
      form.payDay = day;
      const r = settingsFromForm(form, BASE);
      expect(r.ok, day).toBe(false);
    }
    for (const day of ['1', '15', '31']) {
      const form = validForm();
      form.payDay = day;
      expect(settingsFromForm(form, BASE).ok, day).toBe(true);
    }
  });

  it('découvert : le taux est obligatoire dès qu’il y a un plafond ; vide = aucun découvert', () => {
    const noRate = validForm();
    noRate.overdraftRate = '';
    const r1 = settingsFromForm(noRate, BASE);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors.overdraftRate).toBeTruthy();

    const none = validForm();
    none.overdraftLimit = '';
    none.overdraftRate = '';
    const r2 = settingsFromForm(none, BASE);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value.overdraftLimitCents).toBe(0);
      expect(r2.value.overdraftRatePercent).toBe(0);
    }
  });

  it('refuse deux enveloppes de même nom (sans tenir compte de la casse)', () => {
    const form = validForm();
    form.envelopes[1].name = 'VIE OBLIGATOIRE';
    const r = settingsFromForm(form, BASE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors['envelopes.1.name']).toBeTruthy();
  });

  it('mots à masquer : séparateurs variés, doublons retirés, longueur minimale, plafond', () => {
    expect(splitMaskWords('a1, b2;\n c3 ,, b2 ,B2')).toEqual(['a1', 'b2', 'c3']);
    const short = validForm();
    short.maskWords = 'ok\nx';
    const r1 = settingsFromForm(short, BASE);
    expect(r1.ok).toBe(false);
    const many = validForm();
    many.maskWords = Array.from({ length: 51 }, (_, i) => 'mot' + i).join('\n');
    expect(settingsFromForm(many, BASE).ok).toBe(false);
  });

  it('crédits facultatifs : zéro crédit est valide', () => {
    const form = validForm();
    form.loans = [];
    const r = settingsFromForm(form, BASE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.loans).toEqual([]);
  });

  it('les trois enveloppes sont obligatoires', () => {
    const form = validForm();
    form.envelopes = form.envelopes.slice(0, 2);
    expect(settingsFromForm(form, BASE).ok).toBe(false);
  });

  it('aller-retour réglages -> formulaire -> réglages sans perte', () => {
    const r = settingsFromForm(validForm(), BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const again = settingsFromForm(formFromSettings(r.value), BASE);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value).toEqual(r.value);
  });
});

describe('création et mise à jour des réglages', () => {
  it('crée un secret aléatoire de 32 octets, différent à chaque coffre', () => {
    const a = createInitialSettings(validForm());
    const b = createInitialSettings(validForm());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(base64ToBytes(a.value.idSecret).length).toBe(32);
    expect(a.value.idSecret).not.toBe(b.value.idSecret);
    expect(a.value.accounts).toEqual({});
  });

  it('une modification conserve le secret et les comptes', () => {
    const created = createInitialSettings(validForm());
    if (!created.ok) throw new Error('inattendu');
    const current: Settings = { ...created.value, accounts: { k1: 'acc-1' } };
    const form = formFromSettings(current);
    form.income = '3000';
    const r = updateSettings(form, current);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.idSecret).toBe(current.idSecret);
      expect(r.value.accounts).toEqual({ k1: 'acc-1' });
      expect(r.value.monthlyIncomeCents).toBe(300000);
    }
  });
});

describe('réglages chiffrés', () => {
  it('se sauvegardent, se relisent après verrouillage, et ne sont pas lisibles sur disque', async () => {
    const store = await EncryptedStore.open('settings-test-1');
    await store.createVault('un-mot-de-passe-de-test-solide');
    const r = createInitialSettings(validForm());
    if (!r.ok) throw new Error('inattendu');
    await saveSettings(store, r.value);
    store.lock();
    await store.unlock('un-mot-de-passe-de-test-solide');
    expect(await loadSettings(store)).toEqual(r.value);

    const raw = await new Promise<string>((resolve) => {
      const open = indexedDB.open('settings-test-1');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('records', 'readonly');
        const all = tx.objectStore('records').getAll();
        tx.oncomplete = () => {
          db.close();
          let text = '';
          (all.result as Uint8Array[]).forEach((bytes) => {
            for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
          });
          resolve(text);
        };
      };
    });
    expect(raw).not.toContain('monthlyIncomeCents');
    expect(raw).not.toContain('Dupond');
    expect(raw).not.toContain(r.value.idSecret);
  }, 30000);

  it('pas de réglages avant le premier lancement', async () => {
    const store = await EncryptedStore.open('settings-test-2');
    await store.createVault('un-mot-de-passe-de-test-solide');
    expect(await loadSettings(store)).toBeNull();
  }, 30000);
});

describe('contexte des connecteurs', () => {
  it('attribue un identifiant de compte stable, aléatoire et mémorisé', async () => {
    const created = createInitialSettings(validForm());
    if (!created.ok) throw new Error('inattendu');
    const saved: Settings[] = [];
    const { context, current } = createConnectorContext(created.value, async (s) => {
      saved.push(s);
    });
    const a1 = await context.resolveAccountId('1234');
    const a2 = await context.resolveAccountId('1234');
    const b = await context.resolveAccountId('5678');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1).toMatch(/^acc-[0-9a-f]{16}$/);
    expect(a1).not.toContain('1234');
    expect(saved.length).toBe(2); // une écriture par compte nouveau, aucune pour un compte connu
    expect(current().accounts).toEqual({ '1234': a1, '5678': b });
    expect(context.idSecret.length).toBe(32);
  });

  it('réutilise les comptes déjà connus des réglages', async () => {
    const created = createInitialSettings(validForm());
    if (!created.ok) throw new Error('inattendu');
    const known: Settings = { ...created.value, accounts: { '1234': 'acc-existant' } };
    let writes = 0;
    const { context } = createConnectorContext(known, async () => {
      writes++;
    });
    expect(await context.resolveAccountId('1234')).toBe('acc-existant');
    expect(writes).toBe(0);
  });
});
