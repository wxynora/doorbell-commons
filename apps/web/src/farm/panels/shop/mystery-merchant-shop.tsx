import { useState } from "react";
import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import {
	createBoundFarmPurchaseRequest,
	farmPurchaseRequestIssueMessage,
	type CreateFarmPurchaseRequestInput,
} from "../../../auth/farm-purchase-request-client";
import { ShopCartShortcut } from "./shared";
import "../shop-panel.css";

type Market = Extract<
	BoundFarmCatalogRead["data"]["market"],
	{ status: "available" }
>;
type Merchant = Market["mystery_merchant"];
type RequestFeedback =
	| { stage: "idle" | "submitting" | "success" }
	| {
			stage: "error";
			message: string;
			retry: CreateFarmPurchaseRequestInput | null;
	  };

function time(value: string) {
	return new Intl.DateTimeFormat("zh-CN", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Asia/Shanghai",
	}).format(new Date(value));
}

export function MysteryMerchantShop({
	merchant,
	revision,
	busy,
	onPurchase,
	requestPurchase = createBoundFarmPurchaseRequest,
}: {
	merchant: Merchant;
	revision: string;
	busy: boolean;
	onPurchase?: ((ids: string[]) => Promise<boolean>) | undefined;
	requestPurchase?: typeof createBoundFarmPurchaseRequest;
}) {
	const [selected, setSelected] = useState<string[]>([]);
	const [cartOpen, setCartOpen] = useState(false);
	const [feedback, setFeedback] = useState<RequestFeedback>({ stage: "idle" });
	const offers = merchant.status === "present" ? merchant.offers : [];
	const cartItems = offers.filter(
		(offer) => selected.includes(offer.item_id) && !offer.already_bought,
	);
	const locked =
		busy ||
		feedback.stage === "submitting" ||
		(feedback.stage === "error" && feedback.retry !== null);
	const total = (currency: "gold" | "silver") =>
		cartItems.reduce(
			(sum, offer) =>
				sum + (offer.currency === currency ? offer.unit_price : 0),
			0,
		);
	const changeSelection = (id: string) => {
		if (locked) return;
		setSelected((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
		setFeedback({ stage: "idle" });
	};
	const sendRequest = async (attempt: CreateFarmPurchaseRequestInput) => {
		setFeedback({ stage: "submitting" });
		const result = await requestPurchase(attempt);
		if (result.ok) {
			setSelected([]);
			setFeedback({ stage: "success" });
		} else {
			const retryable = [
				"network_unavailable",
				"farm_unavailable",
				"upstream_contract_unavailable",
				"unexpected_response",
			].includes(result.issue.code);
			setFeedback({
				stage: "error",
				message: farmPurchaseRequestIssueMessage(result.issue),
				retry: retryable ? attempt : null,
			});
		}
	};
	const askTa = () => {
		if (locked || cartItems.length === 0) return;
		void sendRequest({
			shop: "mystery-merchant",
			shopRevision: revision,
			idempotencyKey: crypto.randomUUID(),
			items: cartItems.map((item) => ({
				kind: item.kind,
				itemId: item.item_id,
				quantity: 1,
			})),
		});
	};

	return (
		<section aria-label="神秘商人" className="farm-market__mystery-merchant">
			<header>
				<strong>神秘商店</strong>
				<span>
					{merchant.status === "present"
						? `停留至 ${time(merchant.ends_at)}`
						: "今天会出现三次"}
				</span>
			</header>
			<div
				aria-label="今日大概出现时段"
				className="farm-market__mystery-windows"
			>
				{merchant.approximate_windows.map((window) => (
					<span key={window.starts_at}>
						{time(window.starts_at)}–{time(window.ends_at)}
					</span>
				))}
			</div>
			{merchant.status !== "present" ? (
				<p>还没有发现这次商人的准确位置。</p>
			) : (
				<>
					<p>
						现在在{" "}
						<strong>
							{merchant.host_farm_name ?? merchant.host_farm_doorplate}
						</strong>
					</p>
					{cartOpen ? (
						<section
							aria-label="神秘商店购物车"
							className="shop-cart"
							style={{ height: "auto" }}
						>
							<header className="shop-cart__header">
								<button
									aria-label="返回神秘商店"
									className="shop-cart__back"
									onClick={() => setCartOpen(false)}
									type="button"
								>
									‹
								</button>
								<h3>购物车</h3>
								<span>{cartItems.length} 件</span>
							</header>
							{cartItems.length === 0 ? (
								<p>购物车还是空的</p>
							) : (
								<ul className="shop-cart__items">
									{cartItems.map((offer) => (
										<li
											key={offer.item_id}
											style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
										>
											<span className="shop-cart__item-copy">
												<strong>{offer.name}</strong>
												<small>
													{offer.unit_price}{" "}
													{offer.currency === "gold" ? "金币" : "银币"} · 1 份
												</small>
											</span>
											<button
												aria-label={`移除${offer.name}`}
												disabled={locked}
												onClick={() => changeSelection(offer.item_id)}
												type="button"
											>
												移除
											</button>
										</li>
									))}
								</ul>
							)}
							<footer
								className="shop-cart__footer"
								style={{ gridTemplateColumns: "1fr 1fr" }}
							>
								<p style={{ gridColumn: "1 / -1" }}>
									合计：{total("gold")} 金币 · {total("silver")} 银币
								</p>
								<button
									disabled={locked || !onPurchase || cartItems.length === 0}
									onClick={async () => {
										if (
											await onPurchase?.(cartItems.map((item) => item.item_id))
										)
											setSelected([]);
									}}
									type="button"
									style={{ width: "auto" }}
								>
									直接结账
								</button>
								<button
									disabled={locked || cartItems.length === 0 || !onPurchase}
									onClick={askTa}
									type="button"
									style={{ width: "auto" }}
								>
									喊 TA 来买
								</button>
							</footer>
						</section>
					) : (
						<>
							<ul>
								{offers.map((offer) => (
									<li key={offer.item_id}>
										<span>
											<strong>{offer.name}</strong>
											<small>
												{offer.rarity ? offer.rarity + " · " : ""}
												{offer.unit_price}{" "}
												{offer.currency === "gold" ? "金币" : "银币"}
												{offer.grant_quantity > 1
													? ` · 得到 ${offer.grant_quantity}`
													: ""}
											</small>
										</span>
										<button
											aria-label={`${offer.already_bought ? "本轮已买" : selected.includes(offer.item_id) ? "移除" : "加入购物车"}${offer.name}`}
											aria-pressed={
												selected.includes(offer.item_id) &&
												!offer.already_bought
											}
											disabled={locked || !onPurchase || offer.already_bought}
											onClick={() => changeSelection(offer.item_id)}
											type="button"
										>
											{offer.already_bought
												? "本轮已买"
												: selected.includes(offer.item_id)
													? "已入车"
													: "加入购物车"}
										</button>
									</li>
								))}
							</ul>
							<div style={{ position: "relative", height: "15cqw" }}>
								<ShopCartShortcut
									cart={Object.fromEntries(
										cartItems.map((offer) => [offer.item_id, 1]),
									)}
									onOpen={() => setCartOpen(true)}
								/>
							</div>
						</>
					)}
					{feedback.stage === "submitting" ? (
						<p role="status">正在发送…</p>
					) : feedback.stage === "success" ? (
						<p role="status">已通知 TA</p>
					) : feedback.stage === "error" ? (
						<p role="alert">
							{feedback.message}
							{feedback.retry ? (
								<button
									onClick={() => {
										if (feedback.retry) void sendRequest(feedback.retry);
									}}
									type="button"
								>
									重试
								</button>
							) : null}
						</p>
					) : null}
				</>
			)}
		</section>
	);
}
