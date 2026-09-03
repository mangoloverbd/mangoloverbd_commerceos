begin;

create or replace function public.replace_order_items(
  p_org_id uuid,
  p_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  locked_order public.orders%rowtype;
  affected record;
  old_quantity integer;
  new_quantity integer;
  delta integer;
  available_stock integer;
  total_quantity integer;
  total_price numeric;
  product_summary text;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  -- This lock is the serialization point for dispatch checks and item edits.
  select * into locked_order
  from public.orders
  where id = p_order_id and org_id = p_org_id
  for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if locked_order.sent_to_courier
     or locked_order.consignment_id is not null
     or locked_order.tracking_code is not null
     or locked_order.courier_status is not null then
    raise exception 'order items cannot be edited after courier dispatch' using errcode = 'P0001';
  end if;

  drop table if exists pg_temp.order_item_edit;
  create temporary table order_item_edit (
    product_id uuid,
    variant_id uuid,
    quantity integer,
    unique (product_id, variant_id)
  ) on commit drop;

  insert into order_item_edit (product_id, variant_id, quantity)
  select
    nullif(element->>'productId', '')::uuid,
    nullif(element->>'variantId', '')::uuid,
    (element->>'quantity')::integer
  from jsonb_array_elements(p_items) as elements(element);

  if exists (select 1 from order_item_edit where product_id is null and variant_id is null) then
    raise exception 'each item requires a productId or variantId' using errcode = '22023';
  end if;
  if exists (
    select 1
    from order_item_edit
    group by coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
             coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
    having count(*) > 1
  ) then
    raise exception 'duplicate order item' using errcode = '23505';
  end if;
  if exists (select 1 from order_item_edit where quantity < 1) then
    raise exception 'item quantity must be positive' using errcode = '22023';
  end if;

  if exists (
    select 1
    from order_item_edit as e
    left join public.products as p on p.id = e.product_id and p.org_id = p_org_id
    where e.product_id is not null and p.id is null
  ) then
    raise exception 'product does not belong to workspace' using errcode = '23503';
  end if;
  if exists (
    select 1
    from order_item_edit as e
    left join public.product_variants as v on v.id = e.variant_id and v.org_id = p_org_id
    where e.variant_id is not null and v.id is null
  ) then
    raise exception 'variant does not belong to workspace' using errcode = '23503';
  end if;
  if exists (
    select 1
    from order_item_edit as e
    join public.product_variants as v on v.id = e.variant_id and v.org_id = p_org_id
    where e.product_id is not null and v.product_id <> e.product_id
  ) then
    raise exception 'variant does not belong to supplied product' using errcode = '23514';
  end if;

  update order_item_edit as e
  set product_id = v.product_id
  from public.product_variants as v
  where e.variant_id = v.id and v.org_id = p_org_id and e.product_id is null;

  -- Lock every affected inventory row before calculating any delta.
  for affected in
    select distinct product_id
    from (
      select product_id from order_item_edit where variant_id is null
      union all
      select product_id from public.order_items
      where org_id = p_org_id and order_id = p_order_id and variant_id is null
    ) as ids
    where product_id is not null
    order by product_id
  loop
    perform 1 from public.products where id = affected.product_id and org_id = p_org_id for update;
  end loop;
  for affected in
    select distinct variant_id
    from (
      select variant_id from order_item_edit where variant_id is not null
      union all
      select variant_id from public.order_items
      where org_id = p_org_id and order_id = p_order_id and variant_id is not null
    ) as ids
    where variant_id is not null
    order by variant_id
  loop
    perform 1 from public.product_variants where id = affected.variant_id and org_id = p_org_id for update;
  end loop;

  for affected in
    select distinct product_id
    from (
      select product_id from order_item_edit where variant_id is null
      union all
      select product_id from public.order_items
      where org_id = p_org_id and order_id = p_order_id and variant_id is null
    ) as ids
    where product_id is not null
    order by product_id
  loop
    select coalesce(sum(quantity), 0) into old_quantity
    from public.order_items
    where org_id = p_org_id and order_id = p_order_id
      and product_id = affected.product_id and variant_id is null;
    select coalesce(sum(quantity), 0) into new_quantity
    from order_item_edit
    where product_id = affected.product_id and variant_id is null;
    delta := new_quantity - old_quantity;
    select stock_quantity into available_stock
    from public.products
    where id = affected.product_id and org_id = p_org_id;
    if delta > available_stock then
      raise exception 'insufficient stock for product %', affected.product_id using errcode = 'P0001';
    end if;
    update public.products
    set stock_quantity = stock_quantity - delta
    where id = affected.product_id and org_id = p_org_id;
  end loop;

  for affected in
    select distinct variant_id
    from (
      select variant_id from order_item_edit where variant_id is not null
      union all
      select variant_id from public.order_items
      where org_id = p_org_id and order_id = p_order_id and variant_id is not null
    ) as ids
    where variant_id is not null
    order by variant_id
  loop
    select coalesce(sum(quantity), 0) into old_quantity
    from public.order_items
    where org_id = p_org_id and order_id = p_order_id and variant_id = affected.variant_id;
    select coalesce(sum(quantity), 0) into new_quantity
    from order_item_edit
    where variant_id = affected.variant_id;
    delta := new_quantity - old_quantity;
    select stock_quantity into available_stock
    from public.product_variants
    where id = affected.variant_id and org_id = p_org_id;
    if delta > available_stock then
      raise exception 'insufficient stock for variant %', affected.variant_id using errcode = 'P0001';
    end if;
    update public.product_variants
    set stock_quantity = stock_quantity - delta
    where id = affected.variant_id and org_id = p_org_id;
  end loop;

  delete from public.order_items where org_id = p_org_id and order_id = p_order_id;
  insert into public.order_items (
    org_id, order_id, product_id, variant_id, product_name, variant_name,
    unit_price, quantity
  )
  select
    p_org_id,
    p_order_id,
    e.product_id,
    e.variant_id,
    p.name,
    case when v.id is null then null else v.attributes::text end,
    coalesce(p.selling_price, 0) + case when v.id is null then 0 else coalesce(v.price_adjustment, 0) end,
    e.quantity
  from order_item_edit as e
  join public.products as p on p.id = e.product_id and p.org_id = p_org_id
  left join public.product_variants as v on v.id = e.variant_id and v.org_id = p_org_id;

  select coalesce(sum(quantity), 0), coalesce(sum(unit_price * quantity), 0),
         string_agg(format('%sx %s', quantity, product_name), ' + ' order by id)
  into total_quantity, total_price, product_summary
  from public.order_items
  where org_id = p_org_id and order_id = p_order_id;
  update public.orders
  set quantity = total_quantity, price = total_price, product = product_summary
  where id = p_order_id and org_id = p_org_id;
end;
$$;

revoke execute on function public.replace_order_items(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_order_items(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
