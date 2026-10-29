type Node = {value?: unknown; children?: Node[]};

const PLACEHOLDER = 'https://<your-gitgazer-domain>';

export default function replaceAppUrl({appUrl}: {appUrl?: string}) {
    const replace = (node: Node): void => {
        if (appUrl && typeof node.value === 'string') {
            node.value = node.value.replaceAll(PLACEHOLDER, appUrl);
        }
        node.children?.forEach(replace);
    };
    return replace;
}
