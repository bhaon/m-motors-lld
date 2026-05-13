/** Données de mock partagées entre le serveur mock et les specs Playwright. */

export const MOCK_VEHICLES = {
  total: 2,
  items: [
    {
      id: 1,
      make: "Peugeot",
      model: "208",
      year: 2023,
      km: 15000,
      moteur: "Essence",
      prix: 18990,
      lld: false,
      mensualite: null,
      img: "https://placehold.co/600x400?text=Peugeot+208",
      options: [],
      specs: {
        carburant: "Essence",
        boite: "Manuelle",
        couleur: "Rouge",
        places: 5,
        puissance: "100 ch",
      },
    },
    {
      id: 2,
      make: "Renault",
      model: "Zoe",
      year: 2022,
      km: 25000,
      moteur: "Électrique",
      prix: 24500,
      lld: true,
      mensualite: 299,
      img: "https://placehold.co/600x400?text=Renault+Zoe",
      options: [{ n: "Assurance tous risques", p: "+45 €/mois" }],
      specs: {
        carburant: "Électrique",
        boite: "Automatique",
        couleur: "Blanc",
        places: 5,
        puissance: "130 ch",
      },
    },
  ],
};

export const MOCK_MARQUES = ["Peugeot", "Renault"];

export const MOCK_LLD_CATALOG = {
  items: [
    { code: "assurance", label: "Assurance tous risques", surcout_mensuel_ht: 45.0, enabled: true },
    { code: "entretien", label: "Pack entretien", surcout_mensuel_ht: 25.0, enabled: true },
  ],
};

export const MOCK_USER = {
  id: 42,
  email: "client@example.com",
  first_name: "Jean",
  last_name: "Dupont",
  role: "client",
  email_verified: true,
};

export const MOCK_DOSSIERS = [
  {
    id: 101,
    reference: "DOS-2024-001",
    type: "achat",
    status: "brouillon",
    vehicle_id: 1,
    client_id: 42,
    created_at: "2024-01-15T10:00:00Z",
    vehicle: { make: "Peugeot", model: "208", year: 2023 },
  },
  {
    id: 102,
    reference: "DOS-2024-002",
    type: "lld",
    status: "en_instruction",
    vehicle_id: 2,
    client_id: 42,
    created_at: "2024-02-01T14:30:00Z",
    vehicle: { make: "Renault", model: "Zoe", year: 2022 },
  },
];
