import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ContractDocument } from "@/app/_components/contract-document";
import { ProposalDocument } from "@/app/_components/proposal-document";

const firstIp=(value:string|null