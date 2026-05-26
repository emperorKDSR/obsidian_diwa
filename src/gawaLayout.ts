import type {
    GawaDesktopBucketId,
    GawaLayoutBucketPreference,
    GawaLayoutPreferences,
    GawaPaneId,
    GawaTabletBucketId,
} from './types';

export const GAWA_LAYOUT_VERSION = 1 as const;

export const GAWA_PANE_META: Record<GawaPaneId, { title: string; description: string }> = {
    'gawa-inbox': {
        title: 'Inbox',
        description: 'Capture lane for unsorted incoming work.',
    },
    'gawa-projects': {
        title: 'Projects',
        description: 'Planning lane for project-linked tasks.',
    },
    'gawa-today': {
        title: 'Today',
        description: 'Execution lane for overdue and due-today tasks.',
    },
    'gawa-focus': {
        title: 'Focus',
        description: 'Spotlight lane for immediate attention.',
    },
    'gawa-active': {
        title: 'Active',
        description: 'Momentum lane for work already in motion.',
    },
    'gawa-backlog': {
        title: 'Backlog',
        description: 'Queue for later work that is not due now.',
    },
};

export const GAWA_DESKTOP_BUCKET_META: Record<GawaDesktopBucketId, { label: string; description: string }> = {
    left: {
        label: 'Left column',
        description: 'Planning surfaces for capture and project sorting.',
    },
    center: {
        label: 'Center column',
        description: 'Primary execution surfaces for today and focus.',
    },
    right: {
        label: 'Right column',
        description: 'Supporting queues for active work and backlog.',
    },
};

export const GAWA_TABLET_BUCKET_META: Record<GawaTabletBucketId, { label: string; description: string }> = {
    planning: {
        label: 'Planning stack',
        description: 'Tablet planning group for capture and projects.',
    },
    execution: {
        label: 'Execution stack',
        description: 'Tablet execution group for today and focus.',
    },
    support: {
        label: 'Support row',
        description: 'Tablet support row for active work and backlog.',
    },
};

export const GAWA_DESKTOP_BUCKET_DEFAULT_ORDER: Record<GawaDesktopBucketId, readonly GawaPaneId[]> = {
    left: ['gawa-inbox', 'gawa-projects'],
    center: ['gawa-today', 'gawa-focus'],
    right: ['gawa-active', 'gawa-backlog'],
};

export const GAWA_TABLET_BUCKET_DEFAULT_ORDER: Record<GawaTabletBucketId, readonly GawaPaneId[]> = {
    planning: ['gawa-inbox', 'gawa-projects'],
    execution: ['gawa-today', 'gawa-focus'],
    support: ['gawa-active', 'gawa-backlog'],
};

function cloneBucketPreference(preference: GawaLayoutBucketPreference): GawaLayoutBucketPreference {
    return {
        order: [...preference.order],
        hidden: [...preference.hidden],
    };
}

function buildDefaultBucketPreference(allowedPaneIds: readonly GawaPaneId[]): GawaLayoutBucketPreference {
    return {
        order: [...allowedPaneIds],
        hidden: [],
    };
}

export function createDefaultGawaLayoutPreferences(): GawaLayoutPreferences {
    return {
        version: GAWA_LAYOUT_VERSION,
        desktop: {
            left: buildDefaultBucketPreference(GAWA_DESKTOP_BUCKET_DEFAULT_ORDER.left),
            center: buildDefaultBucketPreference(GAWA_DESKTOP_BUCKET_DEFAULT_ORDER.center),
            right: buildDefaultBucketPreference(GAWA_DESKTOP_BUCKET_DEFAULT_ORDER.right),
        },
        tablet: {
            planning: buildDefaultBucketPreference(GAWA_TABLET_BUCKET_DEFAULT_ORDER.planning),
            execution: buildDefaultBucketPreference(GAWA_TABLET_BUCKET_DEFAULT_ORDER.execution),
            support: buildDefaultBucketPreference(GAWA_TABLET_BUCKET_DEFAULT_ORDER.support),
        },
    };
}

export function cloneGawaLayoutPreferences(preferences: GawaLayoutPreferences): GawaLayoutPreferences {
    return {
        version: GAWA_LAYOUT_VERSION,
        desktop: {
            left: cloneBucketPreference(preferences.desktop.left),
            center: cloneBucketPreference(preferences.desktop.center),
            right: cloneBucketPreference(preferences.desktop.right),
        },
        tablet: {
            planning: cloneBucketPreference(preferences.tablet.planning),
            execution: cloneBucketPreference(preferences.tablet.execution),
            support: cloneBucketPreference(preferences.tablet.support),
        },
    };
}

function sanitizeBucketPreference(
    input: unknown,
    allowedPaneIds: readonly GawaPaneId[],
): GawaLayoutBucketPreference {
    const rawPreference = (input && typeof input === 'object')
        ? input as Partial<GawaLayoutBucketPreference>
        : {};
    const sanitizedOrder: GawaPaneId[] = [];
    const seen = new Set<GawaPaneId>();

    for (const paneId of Array.isArray(rawPreference.order) ? rawPreference.order : []) {
        if (!allowedPaneIds.includes(paneId)) continue;
        if (seen.has(paneId)) continue;
        seen.add(paneId);
        sanitizedOrder.push(paneId);
    }

    for (const paneId of allowedPaneIds) {
        if (seen.has(paneId)) continue;
        seen.add(paneId);
        sanitizedOrder.push(paneId);
    }

    const hiddenSeen = new Set<GawaPaneId>();
    const hidden = (Array.isArray(rawPreference.hidden) ? rawPreference.hidden : []).filter((paneId): paneId is GawaPaneId => {
        if (!allowedPaneIds.includes(paneId)) return false;
        if (hiddenSeen.has(paneId)) return false;
        hiddenSeen.add(paneId);
        return true;
    });

    return {
        order: sanitizedOrder,
        hidden,
    };
}

export function sanitizeGawaLayoutPreferences(input: unknown): GawaLayoutPreferences {
    const rawPreferences = (input && typeof input === 'object')
        ? input as Partial<GawaLayoutPreferences>
        : {};
    const desktop: Partial<Record<GawaDesktopBucketId, GawaLayoutBucketPreference>> =
        (rawPreferences.desktop && typeof rawPreferences.desktop === 'object')
            ? rawPreferences.desktop
            : {};
    const tablet: Partial<Record<GawaTabletBucketId, GawaLayoutBucketPreference>> =
        (rawPreferences.tablet && typeof rawPreferences.tablet === 'object')
            ? rawPreferences.tablet
            : {};

    return {
        version: GAWA_LAYOUT_VERSION,
        desktop: {
            left: sanitizeBucketPreference(desktop.left, GAWA_DESKTOP_BUCKET_DEFAULT_ORDER.left),
            center: sanitizeBucketPreference(desktop.center, GAWA_DESKTOP_BUCKET_DEFAULT_ORDER.center),
            right: sanitizeBucketPreference(desktop.right, GAWA_DESKTOP_BUCKET_DEFAULT_ORDER.right),
        },
        tablet: {
            planning: sanitizeBucketPreference(tablet.planning, GAWA_TABLET_BUCKET_DEFAULT_ORDER.planning),
            execution: sanitizeBucketPreference(tablet.execution, GAWA_TABLET_BUCKET_DEFAULT_ORDER.execution),
            support: sanitizeBucketPreference(tablet.support, GAWA_TABLET_BUCKET_DEFAULT_ORDER.support),
        },
    };
}
