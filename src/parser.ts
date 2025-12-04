import ts from 'typescript';
import fs from 'fs';

export class Parser {
    parse(filePath: string): string[] {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const info = ts.preProcessFile(content, true, true);
            return info.importedFiles.map((f) => f.fileName);
        } catch (e) {
            console.warn(`Failed to parse ${filePath}:`, e);
            return [];
        }
    }
}
