/*
 * Tencent is pleased to support the open source community by making TMagicEditor available.
 *
 * Copyright (C) 2023 THL A29 Limited, a Tencent company.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { reactive } from 'vue';
import { cloneDeep, forIn, isEmpty, keys, omit, pick } from 'lodash-es';

import { CodeBlockContent, CodeBlockDSL, HookType, Id, MNode } from '@tmagic/schema';

import editorService from '../services/editor';
import type { CodeRelation, CodeState, HookData } from '../type';
import { CODE_DRAFT_STORAGE_KEY } from '../type';
import { info } from '../utils/logger';

import BaseService from './BaseService';

class CodeBlock extends BaseService {
  private state = reactive<CodeState>({
    isShowCodeEditor: false,
    codeDsl: null,
    id: '',
    editable: true,
    combineIds: [],
    undeletableList: [],
    relations: {},
  });

  constructor() {
    super([
      'setCodeDsl',
      'getCodeDsl',
      'getCodeContentById',
      'getCodeDslByIds',
      'getCurrentDsl',
      'setCodeDslById',
      'setCodeEditorShowStatus',
      'setEditStatus',
      'setCombineIds',
      'setUndeleteableList',
      'deleteCodeDslByIds',
    ]);
  }

  /**
   * 设置活动的代码块dsl数据源
   * @param {CodeBlockDSL} codeDsl 代码DSL
   * @returns {void}
   */
  public async setCodeDsl(codeDsl: CodeBlockDSL): Promise<void> {
    this.state.codeDsl = codeDsl;
    await editorService.setCodeDsl(this.state.codeDsl);
    info('[code-block]:code-dsl-change', this.state.codeDsl);
    this.emit('code-dsl-change', this.state.codeDsl);
  }

  /**
   * 获取活动的代码块dsl数据源（默认从dsl中的codeBlocks字段读取）
   * 方法要支持钩子添加扩展，会被重写为异步方法,因此这里显示写为异步以提醒调用者需以异步形式调用
   * @param {boolean} forceRefresh 是否强制从活动dsl拉取刷新
   * @returns {CodeBlockDSL | null}
   */
  public async getCodeDsl(forceRefresh = false): Promise<CodeBlockDSL | null> {
    return this.getCodeDslSync(forceRefresh);
  }

  public getCodeDslSync(forceRefresh = false): CodeBlockDSL | null {
    if (!this.state.codeDsl || forceRefresh) {
      this.state.codeDsl = editorService.getCodeDslSync();
    }
    return this.state.codeDsl;
  }

  /**
   * 根据代码块id获取代码块内容
   * @param {Id} id 代码块id
   * @returns {CodeBlockContent | null}
   */
  public async getCodeContentById(id: Id): Promise<CodeBlockContent | null> {
    if (!id) return null;
    const totalCodeDsl = await this.getCodeDsl();
    if (!totalCodeDsl) return null;
    return totalCodeDsl[id] ?? null;
  }

  /**
   * 设置代码块ID和代码内容到源dsl
   * @param {Id} id 代码块id
   * @param {CodeBlockContent} codeConfig 代码块内容配置信息
   * @returns {void}
   */
  public async setCodeDslById(id: Id, codeConfig: CodeBlockContent): Promise<void> {
    let codeDsl = await this.getCodeDsl();
    const codeConfigProcessed = codeConfig;
    if (codeConfig.content) {
      // 在保存的时候转换代码内容
      // eslint-disable-next-line no-eval
      codeConfigProcessed.content = eval(codeConfig.content);
    }
    if (!codeDsl) {
      // dsl中无代码块字段
      codeDsl = {
        [id]: {
          ...codeConfigProcessed,
        },
      };
    } else {
      const existContent = codeDsl[id] || {};
      codeDsl = {
        ...codeDsl,
        [id]: {
          ...existContent,
          ...codeConfigProcessed,
        },
      };
    }
    await this.setCodeDsl(codeDsl);
  }

  /**
   * 根据代码块id数组获取代码dsl
   * @param {string[]} ids 代码块id数组
   * @returns {CodeBlockDSL}
   */
  public async getCodeDslByIds(ids: string[]): Promise<CodeBlockDSL> {
    const codeDsl = await this.getCodeDsl();
    return pick(codeDsl, ids) as CodeBlockDSL;
  }

  /**
   * 设置代码编辑面板展示状态
   * @param {boolean} status 是否展示代码编辑面板
   * @returns {void}
   */
  public async setCodeEditorShowStatus(status: boolean): Promise<void> {
    this.state.isShowCodeEditor = status;
  }

  /**
   * 获取代码编辑面板展示状态
   * @returns {boolean} 是否展示代码编辑面板
   */
  public getCodeEditorShowStatus(): boolean {
    return this.state.isShowCodeEditor;
  }

  /**
   * 设置代码编辑面板展示状态及展示内容
   * @param {boolean} status 是否展示代码编辑面板
   * @param {Id} id 代码块id
   * @returns {void}
   */
  public setCodeEditorContent(status: boolean, id: Id): void {
    if (!id) return;
    this.setId(id);
    this.state.isShowCodeEditor = status;
  }

  /**
   * 获取当前选中的代码块内容
   * @returns {CodeBlockContent | null}
   */
  public async getCurrentDsl(): Promise<CodeBlockContent | null> {
    return await this.getCodeContentById(this.state.id);
  }

  /**
   * 获取编辑状态
   * @returns {boolean} 是否可编辑
   */
  public getEditStatus(): boolean {
    return this.state.editable;
  }

  /**
   * 设置编辑状态
   * @param {boolean} 是否可编辑
   * @returns {void}
   */
  public async setEditStatus(status: boolean): Promise<void> {
    this.state.editable = status;
  }

  /**
   * 设置当前选中的代码块ID
   * @param {Id} id 代码块id
   * @returns {void}
   */
  public setId(id: Id): void {
    if (!id) return;
    this.state.id = id;
  }

  /**
   * 获取当前选中的代码块ID
   * @returns {Id} id 代码块id
   */
  public getId(): Id {
    return this.state.id;
  }

  /**
   * 设置当前选中组件已关联绑定的代码块id数组
   * @param {string[]} ids 代码块id数组
   * @returns {void}
   */
  public async setCombineIds(ids: string[]): Promise<void> {
    this.state.combineIds = ids;
  }

  /**
   * 获取当前选中组件已关联绑定的代码块id数组
   * @returns {string[]}
   */
  public getCombineIds(): string[] {
    return this.state.combineIds;
  }

  /**
   * 刷新绑定关系
   * @returns {CodeRelation | null}
   */
  public refreshCombineInfo(): CodeRelation | null {
    const root = editorService.get('root');
    if (!root) return null;
    const relations = {};
    this.recurseMNode(root, relations);
    this.state.relations = relations;
    return this.state.relations;
  }

  /**
   * 获取绑定关系
   * @returns {CodeRelation}
   */
  public getCombineInfo(): CodeRelation {
    return this.state.relations;
  }

  /**
   * 获取不可删除列表
   * @returns {Id[]}
   */
  public getUndeletableList(): Id[] {
    return this.state.undeletableList;
  }

  /**
   * 设置不可删除列表：为业务逻辑预留的不可删除的代码块列表，由业务逻辑维护（如代码块上线后不可删除）
   * @param {Id[]} codeIds 代码块id数组
   * @returns {void}
   */
  public async setUndeleteableList(codeIds: Id[]): Promise<void> {
    this.state.undeletableList = codeIds;
  }

  /**
   * 设置代码草稿
   */
  public setCodeDraft(codeId: Id, content: string): void {
    globalThis.localStorage.setItem(`${CODE_DRAFT_STORAGE_KEY}_${codeId}`, content);
  }

  /**
   * 获取代码草稿
   */
  public getCodeDraft(codeId: Id): string | null {
    return globalThis.localStorage.getItem(`${CODE_DRAFT_STORAGE_KEY}_${codeId}`);
  }

  /**
   * 删除代码草稿
   */
  public removeCodeDraft(codeId: Id): void {
    globalThis.localStorage.removeItem(`${CODE_DRAFT_STORAGE_KEY}_${codeId}`);
  }

  /**
   * 在dsl数据源中删除指定id的代码块
   * @param {Id[]} codeIds 需要删除的代码块id数组
   * @returns {CodeBlockDSL} 删除后的code dsl
   */
  public async deleteCodeDslByIds(codeIds: Id[]): Promise<CodeBlockDSL> {
    const currentDsl = await this.getCodeDsl();
    const newDsl = omit(currentDsl, codeIds);
    await this.setCodeDsl(newDsl);
    return newDsl;
  }

  /**
   * 生成代码块唯一id
   * @returns {Id} 代码块唯一id
   */
  public async getUniqueId(): Promise<Id> {
    const newId = `code_${Math.random().toString(10).substring(2).substring(0, 4)}`;
    // 判断是否重复
    const dsl = await this.getCodeDsl();
    const existedIds = keys(dsl);
    if (!existedIds.includes(newId)) return newId;
    return await this.getUniqueId();
  }

  /**
   * 通过组件id解除绑定关系（删除组件）
   * @param {MNode} compId 组件节点
   * @returns void
   */
  public async deleteCompsInRelation(node: MNode): Promise<void> {
    const codeDsl = cloneDeep(await this.getCodeDsl());
    if (!codeDsl) return;
    this.refreshRelationDeep(node, codeDsl);
    this.setCodeDsl(codeDsl);
  }

  public resetState() {
    this.state.isShowCodeEditor = false;
    this.state.codeDsl = null;
    this.state.id = '';
    this.state.editable = true;
    this.state.combineIds = [];
    this.state.undeletableList = [];
  }

  public destroy(): void {
    this.resetState();
    this.removeAllListeners();
    this.removeAllPlugins();
  }

  /**
   * 删除组件时 如果是容器 需要遍历删除其包含节点的绑定信息
   * @param {MNode} node 节点信息
   * @param {CodeBlockDSL} codeDsl 代码块
   * @returns void
   */
  private refreshRelationDeep(node: MNode, codeDsl: CodeBlockDSL): void {
    if (!node.id) return;
    forIn(codeDsl, (codeBlockContent) => {
      const compsContent = codeBlockContent.comps || {};
      codeBlockContent.comps = omit(compsContent, node.id);
    });
    if (!isEmpty(node.items)) {
      node.items.forEach((item: MNode) => {
        this.refreshRelationDeep(item, codeDsl);
      });
    }
  }

  /**
   * 递归遍历dsl中挂载了代码块的节点，并更新绑定关系数据
   * @param {MContainer} node 节点信息
   * @returns void
   */
  private recurseMNode(node: MNode, relations: CodeRelation): void {
    forIn(node, (value, key) => {
      let unConfirmedValue: MNode = { id: node.id };
      if (value?.hookType === HookType.CODE && !isEmpty(value.hookData)) {
        value.hookData.forEach((relationItem: HookData) => {
          // continue
          if (!relationItem.codeId) return;
          if (!relations[relationItem.codeId]) {
            relations[relationItem.codeId] = {};
          }
          const codeItem = relations[relationItem.codeId];
          if (isEmpty(codeItem[node.id])) {
            codeItem[node.id] = [];
          }
          codeItem[node.id].push(key);
        });
        // continue
        return;
      }
      if (typeof value === 'object') {
        // 检查value内部是否有嵌套
        unConfirmedValue = {
          ...unConfirmedValue,
          ...value,
        };
        this.recurseMNode(unConfirmedValue, relations);
      }
    });
    if (!isEmpty(node.items)) {
      node.items.forEach((item: MNode) => {
        this.recurseMNode(item, relations);
      });
    }
  }
}

export type CodeBlockService = CodeBlock;

export default new CodeBlock();
