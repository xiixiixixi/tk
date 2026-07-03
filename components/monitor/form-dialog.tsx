"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useForm, type FieldValues } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Muted } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { emitMonitorsChanged } from "./utils";

/**
 * 复用的"添加监控目标"对话框(creator + keyword 共用)
 *
 * Editorial 风:
 * - 大 dialog title + Muted description
 * - 字段紧凑堆叠(gap-4)
 * - 错误在 input 下方红字(FormMessage)
 * - 提交按钮在 loading 时 disable + 显示 spinner
 * - 成功后 dispatch 'monitors:changed' 事件,让列表 refetch
 *
 * 字段值统一为 string(URL / 关键词 / 频率字符串都按文本处理),
 * 校验通过 zod schema 在 fieldSchemas 集中声明。
 */

export type MonitorFieldConfig = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "url" | "number";
  inputClassName?: string;
};

export type MonitorFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  // name → zod 校验器(必填 / 长度 / URL 格式等)
  fieldSchemas: Record<string, z.ZodTypeAny>;
  fields: ReadonlyArray<MonitorFieldConfig>;
  // 与 fields 一一对应的初始值
  defaultValues: FieldValues;
  onSubmit: (values: FieldValues) => Promise<void> | void;
};

/**
 * 根据 fields + fieldSchemas 拼出完整的 zod object schema
 * - 默认每个字段按 z.string() 处理,再用调用方提供的 schema 覆盖
 * - 这样调用方写 schema 时只关心"非空 + 长度 + URL 格式"等差异部分
 */
function buildSchema(
  fields: ReadonlyArray<MonitorFieldConfig>,
  fieldSchemas: Record<string, z.ZodTypeAny>
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    shape[f.name] = fieldSchemas[f.name] ?? z.string();
  }
  return z.object(shape);
}

export function MonitorFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  fieldSchemas,
  fields,
  defaultValues,
  onSubmit,
}: MonitorFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false);
  const schema = React.useMemo(
    () => buildSchema(fields, fieldSchemas),
    [fields, fieldSchemas]
  );

  const form = useForm<FieldValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // open 切换时重置,避免上次提交的脏值/错误残留
  React.useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  async function handleSubmit(values: FieldValues) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
      emitMonitorsChanged();
      onOpenChange(false);
    } catch {
      // 错误展示由调用方决定(setError 写回 RHF state);
      // dialog 保持打开,便于用户修正
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription asChild>
              <Muted>{description}</Muted>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            {fields.map((f) => (
              <FormField
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <FormControl>
                      <Input
                        type={f.type ?? "text"}
                        placeholder={f.placeholder}
                        disabled={submitting}
                        className={cn("h-10", f.inputClassName)}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <DialogFooter className="mt-2 gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting} className="min-w-[96px]">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    提交中
                  </>
                ) : (
                  submitLabel
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
