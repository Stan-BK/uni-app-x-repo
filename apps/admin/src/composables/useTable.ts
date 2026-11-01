import { onMounted, ref, type Ref } from "vue";

/** 分页请求参数 */
export type TablePageParams = {
  page: number;
  pageSize: number;
};

/**
 * 后端列表返回值：分页接口返回对象，一次性接口返回数组。
 * 两种形态都支持，避免为「活动列表」单独写一套状态。
 */
export type TableResult<Row> =
  | Row[]
  | {
      items: Row[];
      total: number;
      page?: number;
      pageSize?: number;
    };

export type UseTableOptions<Row> = {
  /** 取数函数；页面自己的筛选条件在闭包里读取即可（变更时页面主动 load） */
  fetch: (params: TablePageParams) => Promise<TableResult<Row>>;
  pageSize?: number;
  /** 默认挂载后立即取第 1 页；设为 false 则手动 load */
  immediate?: boolean;
  /** 错误统一交给页面处理（401 跳登录、403 跳首页、提示文案） */
  onError?: (error: unknown) => unknown;
};

/**
 * 列表页状态机：loading / rows / 分页 / 错误处理。
 *
 * 用法：
 * ```ts
 * const { rows, loading, page, pageSize, total, load, goPage, refresh } = useTable({
 *   fetch: ({ page }) => listUsers(page),
 *   onError: (e) => handleListError(e, router, "加载失败"),
 * });
 * ```
 */
export function useTable<Row>(options: UseTableOptions<Row>) {
  const rows = ref<Row[]>([]) as Ref<Row[]>;
  const loading = ref(false);
  const page = ref(1);
  const pageSize = ref(options.pageSize ?? 20);
  const total = ref(0);

  async function load(targetPage = page.value): Promise<void> {
    loading.value = true;
    try {
      const result = await options.fetch({
        page: targetPage,
        pageSize: pageSize.value,
      });
      if (Array.isArray(result)) {
        rows.value = result;
        total.value = result.length;
        page.value = 1;
      } else {
        rows.value = result.items;
        total.value = result.total;
        page.value = result.page ?? targetPage;
        pageSize.value = result.pageSize ?? pageSize.value;
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      loading.value = false;
    }
  }

  /** 翻页：分页组件事件直接绑定 */
  function goPage(nextPage: number): void {
    void load(nextPage);
  }

  /** 刷新当前页（处置动作成功后调用） */
  function refresh(): void {
    void load(page.value);
  }

  if (options.immediate !== false) {
    onMounted(() => {
      void load(1);
    });
  }

  return { rows, loading, page, pageSize, total, load, goPage, refresh };
}
