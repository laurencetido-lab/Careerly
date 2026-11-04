export type Locale = "en" | "fr";

const dict = {
  en: {
    home: "Home", workspaces: "My workspaces", research: "Research", companies: "Companies", opportunities: "Opportunities",
    networking: "Networking", applications: "Applications", agenda: "Agenda", compensation: "Compensation", analytics: "Ranking & analytics",
    monitoring: "Monitoring", documents: "Documents", settings: "Settings", profile: "Profile", notifications: "Notifications",
    assistant: "Assistant", signOut: "Sign out", newWorkspace: "New workspace", import: "Import data",
    nextActions: "Next best actions", whatChanged: "What changed since your last visit", deadlines: "Upcoming deadlines",
    runningResearch: "Research in progress", topContacts: "People to contact", needsAction: "Applications needing action",
  },
  fr: {
    home: "Accueil", workspaces: "Mes espaces", research: "Recherche", companies: "Entreprises", opportunities: "Opportunités",
    networking: "Réseau", applications: "Candidatures", agenda: "Échéances", compensation: "Rémunération", analytics: "Classement & analyses",
    monitoring: "Veille", documents: "Documents", settings: "Paramètres", profile: "Profil", notifications: "Notifications",
    assistant: "Assistant", signOut: "Se déconnecter", newWorkspace: "Nouvel espace", import: "Importer des données",
    nextActions: "Prochaines actions recommandées", whatChanged: "Nouveautés depuis votre dernière visite", deadlines: "Échéances à venir",
    runningResearch: "Recherches en cours", topContacts: "Personnes à contacter", needsAction: "Candidatures à traiter",
  },
} as const;

export type Dict = Record<keyof (typeof dict)["en"], string>;
export function t(locale: string | null | undefined): Dict {
  return dict[(locale === "fr" ? "fr" : "en") as Locale];
}
