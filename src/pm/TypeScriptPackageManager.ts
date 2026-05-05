import {
  cadaide,
  type IDetailedPackageInfo,
  type IInstalledPackageInfo,
  type IPackageInfo,
  type IPackageManager,
} from "@cadaide/plugin";
import { Path } from "../utils/path";

export interface IPackageJson {
  name: string;
  version: string;
  description: string;
  dependencies?: {
    [packageName: string]: string;
  };
}

export class TypeScriptPackageManager implements IPackageManager {
  #cwd: string | null = null;

  async listInstalled(): Promise<IInstalledPackageInfo[]> {
    const packageJson = await this.#readPackageJson();
    if (!packageJson.dependencies) return [];

    const packages: IInstalledPackageInfo[] = [];

    for (const dep of Object.keys(packageJson.dependencies)) {
      const depPackageJson = await this.#readPackageJson(`node_modules/${dep}`);
      if (!depPackageJson) {
        cadaide.notifications.error(
          "Failed to read package.json of package " + dep,
        );

        continue;
      }

      packages.push({
        id: depPackageJson.name,
        name: depPackageJson.name,
        installedVersion: depPackageJson.version,
        shortDescription: depPackageJson.description ?? "",
      });
    }

    return packages;
  }

  async search(query: string): Promise<IPackageInfo[]> {
    const endpoint = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`;
    const response = await cadaide.http.get<any>(endpoint);

    if (!("objects" in response)) {
      cadaide.notifications.error(JSON.stringify(response));

      return [];
    }

    return response.objects.map(
      (pkg: { package: IPackageJson }) =>
        ({
          id: pkg.package.name,
          name: pkg.package.name,
          shortDescription: pkg.package.description,
          versions: [], // Not needed for search
        }) as IPackageInfo,
    );
  }

  async detail(id: string): Promise<IDetailedPackageInfo> {
    const endpoint = `https://registry.npmjs.org/${encodeURIComponent(id)}`;
    const result = await cadaide.http.get<any>(endpoint);

    const packageJson = await this.#readPackageJson();

    if (!("name" in result)) {
      cadaide.notifications.error(JSON.stringify(result));

      return {} as IDetailedPackageInfo;
    }

    const installedVersion = packageJson.dependencies
      ? (packageJson.dependencies[result.name] ?? null)
      : null;

    const readme = await this.#tryToFindReadme(
      id,
      installedVersion ?? Object.keys(result.versions).toReversed()[0]!,
    );

    return {
      id: result.name,
      name: result.name,
      isInstalled: installedVersion != null,
      installedVersion: installedVersion,
      versions: Object.keys(result.versions).toReversed(),
      shortDescription: result.description,
      description: readme as string,
    };
  }

  async install(id: string, version: string): Promise<void> {
    await cadaide.notifications.info(`Installing ${id}@${version}`);

    const res = await cadaide.shell.run(
      ["bun", "install", `${id}@${version}`],
      {
        cwd: await this.#getCwd(),
      },
    );

    if (res.code != 0) {
      cadaide.notifications.error(res.stderr);

      return;
    }

    cadaide.notifications.success("Package installed successfully.");
  }

  async uninstall(id: string): Promise<void> {
    await cadaide.notifications.info(`Uninstalling ${id}`);

    const res = await cadaide.shell.run(["bun", "uninstall", id], {
      cwd: await this.#getCwd(),
    });

    if (res.code != 0) {
      cadaide.notifications.error(res.stderr);

      return;
    }

    cadaide.notifications.success("Package uninstalled successfully.");
  }

  async #readPackageJson(path: string = "/") {
    const commandResult = await cadaide.shell.run(["cat", "package.json"], {
      cwd: Path.join(await this.#getCwd(), path),
    });

    if (commandResult.stderr.length > 0) {
      cadaide.notifications.error(commandResult.stderr);

      return {} as IPackageJson;
    }

    return JSON.parse(commandResult.stdout) as IPackageJson;
  }

  async #getCwd() {
    if (!this.#cwd) this.#cwd = await cadaide.workspace.getProjectPath();

    return this.#cwd;
  }

  async #tryToFindReadme(packageId: string, latestVersion: string) {
    const notFound = `<p>Readme not found. Visit <a href="https://npmjs.com/package/${encodeURIComponent(packageId)}">npm package page</a></p>`;

    const endpoint = `https://data.jsdelivr.com/v1/package/npm/${encodeURIComponent(packageId)}@${encodeURIComponent(latestVersion)}/tree`;
    const result = await cadaide.http.get<any>(endpoint);

    if (!("files" in result)) {
      return notFound;
    }

    const filesToTry = [
      "readme",
      "readme.md",
      "readme.html",
      "readme.rtf",
      "readme.txt",
    ]; // Case insensitive

    for (const file of filesToTry) {
      const found = result.files.find((f: any) => f.name.toLowerCase() == file);
      if (!found) continue;

      const readmeResult = await cadaide.http.get(
        "https://cdn.jsdelivr.net/npm/" +
          encodeURIComponent(packageId) +
          "/" +
          encodeURIComponent(found.name),
      );

      return readmeResult;
    }

    return notFound;
  }
}
