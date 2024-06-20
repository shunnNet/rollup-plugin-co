import {
  extname as getExtname,
  resolve as resolvePath,
  dirname as getDirname,
} from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { Generation, RewriteTextFileGeneration, WriteTextFileGeneration } from '../Generation'
import { TGenerationContext } from '../types'
import querystring from 'node:querystring'

export class Resolver {
  public supportedSourceExtensions: string[] = []
  isSupportedSource(filename: string) {
    const ext = getExtname(filename).slice(1)
    return this.supportedSourceExtensions.includes(ext)
  }

  resolveGeneration(
    targetPath: string,
    generationContext: TGenerationContext,
  ): Generation {
    if (!existsSync(targetPath)) {
      return new WriteTextFileGeneration(targetPath, generationContext)
    }
    const content = readFileSync(targetPath, 'utf-8')
    const matchAllComments = [
      ...content.matchAll(/\/\/ co-target(?<prompt>.*)\n(?<coContent>[\s\S]*?)\n\/\/\sco-target-end/g),
      ...content.matchAll(/<!--\sco-target\s(?<prompt>.*)-->\n(?<coContent>[\s\S]+)\n<!--\sco-target-end\s-->/g),
    ]
    if (!matchAllComments.length) {
      return new WriteTextFileGeneration(targetPath, generationContext)
    }
    const rewriteDirectives = matchAllComments.flatMap((match, index) => match.groups?.coContent !== undefined
      ? [{
          index,
          content: match.groups.coContent || '',
          prompt: match.groups?.prompt || '',
          resolver: this,
          result: '',
        }]
      : [],
    )

    // TODO: handle duplicate contents
    // index solution can not handle because index may change after each rewrite
    return new RewriteTextFileGeneration(
      targetPath,
      rewriteDirectives,
      generationContext,
    )
  }

  rewriteGeneration(content: string, id: number, rewrite: string): string {
    const matchAllResults = [
      ...content.matchAll(/(?<header>\/\/ co-target(?<prompt>.*)\n)(?<coContent>[\s\S]*?)(?<footer>\n\/\/\sco-target-end)/g),
      ...content.matchAll(/<!--\sco-target\s(?<prompt>.*)-->\n(?<coContent>[\s\S]+)\n<!--\sco-target-end\s-->/g),
    ]
    if (matchAllResults[id]) {
      const coContent = matchAllResults[id].groups?.coContent
      const header = matchAllResults[id].groups?.header
      const footer = matchAllResults[id].groups?.footer
      const fullMatchContent = matchAllResults[id][0]
      if (coContent) {
        return content.replace(
          fullMatchContent,
          fullMatchContent.replace(coContent, rewrite),
        )
      }
      else if (header && footer) {
        return content.replace(
          fullMatchContent,
          header + rewrite + footer,
        )
      }
      else {
        return content
      }
    }
    else {
      return content
    }
  }

  ensureAbsolutePath(baseFileName: string, relatedPath: string) {
    const baseExtension = getExtname(baseFileName).split('.').at(-1)
    if (!baseExtension) {
      throw new Error('baseFileName must have extension')
    }

    // TODO: Implement isNodeModule
    // See src/utils.ts
    // if (isNodeModule(relatedPath)) {
    //   throw new Error('Not support node_modules import')
    // }

    const baseDir = getDirname(baseFileName)

    if (getExtname(relatedPath)) {
      return resolvePath(baseDir, relatedPath)
    }
    else {
      const [pathWithoutQs, qs] = relatedPath.split('?')
      const qsObj = querystring.parse(qs)
      if (qsObj['co-ext'] && 'co-index' in qsObj) {
        return resolvePath(baseDir, pathWithoutQs, 'index' + '.' + qsObj['co-ext'])
      }
      else if (qsObj['co-ext']) {
        return resolvePath(baseDir, pathWithoutQs + '.' + qsObj['co-ext'])
      }
      else {
        throw new Error(`Failed to resolve without extension: ${relatedPath}`)
      }
    }
  }
}
